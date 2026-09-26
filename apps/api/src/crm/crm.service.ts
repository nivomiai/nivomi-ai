import { Inject, Injectable } from '@nestjs/common';
import {
  crmConnections,
  crmSyncRuns,
  organizationMembers,
  type CrmConnectionSettings,
  type Database,
} from '@nivomi/database';
import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service.js';
import type { Principal, TenantPrincipal } from '../auth/principal.js';
import { roleHasPermission } from '../authorization/permissions.js';
import { AppError } from '../common/errors.js';
import type { ClientContext } from '../common/request-context.js';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';
import { DATABASE } from '../database/database.module.js';
import { JobQueue } from '../jobs/jobs.js';
import { CredentialsCipher } from '../security/credentials-cipher.js';
import { SignedTokens } from '../security/signed-tokens.js';
import { CRM_PROVIDER, CrmAuthError, type CRMProvider } from './crm-provider.js';

export const CRM_JOBS = { sync: 'crm.sync', schedule: 'crm.schedule' } as const;
/** FR-137 / A-83. */
export const SCHEDULED_SYNC_INTERVAL_MS = 15 * 60_000;
const OAUTH_STATE_TTL_SECONDS = 10 * 60;
/** Refresh access tokens this long before they expire. */
const REFRESH_MARGIN_MS = 5 * 60_000;

interface OAuthState extends Record<string, unknown> {
  readonly organizationId: string;
  readonly userId: string;
  readonly confirmAccountChange: boolean;
  readonly nonce: string;
}

export type CallbackOutcome =
  | 'connected'
  | 'denied'
  | 'invalid_state'
  | 'not_allowed'
  | 'account_in_use'
  | 'account_change_requires_confirmation'
  | 'provider_error';

type Connection = typeof crmConnections.$inferSelect;

@Injectable()
export class CrmService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CRM_PROVIDER) private readonly crm: CRMProvider,
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly cipher: CredentialsCipher,
    private readonly tokens: SignedTokens,
    private readonly jobs: JobQueue,
    private readonly audit: AuditService,
    @InjectPinoLogger(CrmService.name) private readonly logger: PinoLogger,
  ) {}

  /** The redirect URI registered in the HubSpot app; same-origin with the web app. */
  get redirectUri(): string {
    return `${this.env.APP_WEB_URL}/api/v1/integrations/crm/hubspot/callback`;
  }

  /** FR-131 "Connected Sources" / "CRM Sync". Never returns tokens. */
  async status(tenant: TenantPrincipal) {
    const connection = await this.connection(tenant.membership.organizationId);
    const runs = connection
      ? await this.db
          .select()
          .from(crmSyncRuns)
          .where(eq(crmSyncRuns.connectionId, connection.id))
          .orderBy(desc(crmSyncRuns.createdAt))
          .limit(10)
      : [];
    return {
      provider: this.crm.provider,
      available: this.crm.configured && this.cipher.configured,
      connection: connection
        ? {
            status: connection.status,
            accountId: connection.externalAccountId,
            scopes: connection.scopes,
            leadsEnabled: connection.scopes.includes('crm.objects.leads.read'),
            settings: connection.settings,
            connectedAt: connection.connectedAt,
            disconnectedAt: connection.disconnectedAt,
            lastSyncAt: connection.lastSyncAt,
            lastError: connection.lastError,
          }
        : null,
      runs: runs.map((r) => ({
        id: r.id,
        trigger: r.trigger,
        mode: r.mode,
        status: r.status,
        counts: r.counts,
        error: r.error,
        createdAt: r.createdAt,
        completedAt: r.completedAt,
      })),
    };
  }

  /** FR-84: starts OAuth. The signed `state` binds the flow to this Member and Organization. */
  authorize(tenant: TenantPrincipal, input: { confirmAccountChange: boolean }) {
    if (!this.crm.configured || !this.cipher.configured) {
      throw new AppError(
        'SERVICE_UNAVAILABLE',
        'Connecting HubSpot is not available yet. Ask Nivomi support to enable it.',
      );
    }
    const state = this.tokens.sign(
      'crm-oauth-state',
      {
        organizationId: tenant.membership.organizationId,
        userId: tenant.userId,
        confirmAccountChange: input.confirmAccountChange,
        nonce: randomUUID(),
      } satisfies OAuthState,
      OAUTH_STATE_TTL_SECONDS,
    );
    return { authorizeUrl: this.crm.authorizeUrl(state, this.redirectUri) };
  }

  /**
   * OAuth callback (browser redirect). Re-checks that the signed-in Member is the one who started
   * the flow and may still manage integrations, then stores encrypted tokens and starts a sync.
   */
  async callback(
    principal: Principal,
    query: { code?: string | undefined; state?: string | undefined; error?: string | undefined },
    context: ClientContext,
  ): Promise<CallbackOutcome> {
    const state = query.state
      ? this.tokens.verify<OAuthState>('crm-oauth-state', query.state)
      : null;
    if (!state || state.userId !== principal.userId) return 'invalid_state';
    if (query.error || !query.code) return 'denied';

    const [member] = await this.db
      .select({ role: organizationMembers.role })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, state.organizationId),
          eq(organizationMembers.userId, principal.userId),
        ),
      )
      .limit(1);
    if (!member || !roleHasPermission(member.role, 'integrations.manage')) return 'not_allowed';

    let tokens;
    try {
      tokens = await this.crm.exchangeCode(query.code, this.redirectUri);
    } catch (error) {
      this.logger.warn(
        { err: error, organizationId: state.organizationId },
        'CRM code exchange failed',
      );
      return 'provider_error';
    }
    const orgId = state.organizationId;
    const reject = async (outcome: CallbackOutcome) => {
      await this.crm.revoke(tokens.refreshToken).catch(() => undefined);
      await this.audit.record(
        {
          action: 'crm.connection_rejected',
          organizationId: orgId,
          actorUserId: principal.userId,
          resourceType: 'crm_connection',
          metadata: { provider: this.crm.provider, accountId: tokens.accountId, reason: outcome },
        },
        context,
      );
      return outcome;
    };

    // A-39: one CRM account can be live in only one Organization.
    const [elsewhere] = await this.db
      .select({ id: crmConnections.id })
      .from(crmConnections)
      .where(
        and(
          eq(crmConnections.provider, this.crm.provider),
          eq(crmConnections.externalAccountId, tokens.accountId),
          ne(crmConnections.status, 'DISCONNECTED'),
          ne(crmConnections.organizationId, orgId),
        ),
      )
      .limit(1);
    if (elsewhere) return reject('account_in_use');

    const existing = await this.connection(orgId);
    const accountChanged = existing !== null && existing.externalAccountId !== tokens.accountId;
    // FR-86: a different account needs explicit confirmation and resets the mappings.
    if (accountChanged && !state.confirmAccountChange) {
      return reject('account_change_requires_confirmation');
    }

    const values = {
      organizationId: orgId,
      provider: this.crm.provider,
      externalAccountId: tokens.accountId,
      status: 'CONNECTED' as const,
      scopes: tokens.scopes,
      accessTokenEncrypted: this.cipher.encrypt(tokens.accessToken),
      refreshTokenEncrypted: this.cipher.encrypt(tokens.refreshToken),
      accessTokenExpiresAt: tokens.expiresAt,
      connectedByUserId: principal.userId,
      connectedAt: new Date(),
      disconnectedAt: null,
      lastError: null,
      ...(accountChanged ? { settings: {}, syncWatermark: null } : {}),
    };
    await this.db.transaction(async (tx) => {
      const [connection] = await tx
        .insert(crmConnections)
        .values(values)
        .onConflictDoUpdate({
          target: [crmConnections.organizationId, crmConnections.provider],
          set: values,
        })
        .returning({ id: crmConnections.id, syncWatermark: crmConnections.syncWatermark });
      if (!connection) throw new Error('connection upsert returned no row');
      await this.audit.record(
        {
          action: 'crm.connected',
          organizationId: orgId,
          actorUserId: principal.userId,
          resourceType: 'crm_connection',
          resourceId: connection.id,
          metadata: {
            provider: this.crm.provider,
            accountId: tokens.accountId,
            reconnected: existing !== null && !accountChanged,
            accountChanged,
          },
        },
        context,
        tx,
      );
      // FR-86: reconnecting resumes incrementally; a first or changed connection ingests fully.
      await tx
        .update(crmSyncRuns)
        .set({ status: 'CANCELLED', completedAt: new Date() })
        .where(
          and(
            eq(crmSyncRuns.connectionId, connection.id),
            inArray(crmSyncRuns.status, ['QUEUED', 'RUNNING']),
          ),
        );
      await this.startRun(tx, {
        organizationId: orgId,
        connectionId: connection.id,
        trigger: 'INITIAL',
        mode: connection.syncWatermark ? 'INCREMENTAL' : 'FULL',
        requestedByUserId: principal.userId,
      });
    });
    return 'connected';
  }

  /** FR-86: stops sync and revokes tokens; every Nivomi record is kept. */
  async disconnect(tenant: TenantPrincipal, context: ClientContext): Promise<void> {
    const orgId = tenant.membership.organizationId;
    const connection = await this.connection(orgId);
    if (!connection || connection.status === 'DISCONNECTED') {
      throw new AppError('NOT_FOUND', 'No CRM is connected.');
    }
    if (connection.refreshTokenEncrypted) {
      try {
        await this.crm.revoke(this.cipher.decrypt(connection.refreshTokenEncrypted));
      } catch (error) {
        // Revocation is best effort; the tokens are deleted here regardless.
        this.logger.warn({ err: error, organizationId: orgId }, 'CRM token revocation failed');
      }
    }
    await this.db.transaction(async (tx) => {
      await tx
        .update(crmConnections)
        .set({
          status: 'DISCONNECTED',
          accessTokenEncrypted: null,
          refreshTokenEncrypted: null,
          accessTokenExpiresAt: null,
          disconnectedAt: new Date(),
        })
        .where(eq(crmConnections.id, connection.id));
      await tx
        .update(crmSyncRuns)
        .set({ status: 'CANCELLED', completedAt: new Date() })
        .where(
          and(
            eq(crmSyncRuns.connectionId, connection.id),
            inArray(crmSyncRuns.status, ['QUEUED', 'RUNNING']),
          ),
        );
      await this.audit.record(
        {
          action: 'crm.disconnected',
          organizationId: orgId,
          actorUserId: tenant.userId,
          resourceType: 'crm_connection',
          resourceId: connection.id,
        },
        context,
        tx,
      );
    });
  }

  /** FR-19: which CRM property supplies the Consent Basis; unmapped contacts are not callable. */
  async updateSettings(
    tenant: TenantPrincipal,
    settings: CrmConnectionSettings,
    context: ClientContext,
  ): Promise<void> {
    const connection = await this.connection(tenant.membership.organizationId);
    if (!connection || connection.status === 'DISCONNECTED') {
      throw new AppError('NOT_FOUND', 'No CRM is connected.');
    }
    await this.db
      .update(crmConnections)
      .set({ settings })
      .where(eq(crmConnections.id, connection.id));
    await this.audit.record(
      {
        action: 'crm.settings_updated',
        organizationId: connection.organizationId,
        actorUserId: tenant.userId,
        resourceType: 'crm_connection',
        resourceId: connection.id,
      },
      context,
    );
  }

  /** FR-19 / FR-131: an ADMIN or MANAGER runs an ingest now. */
  async requestSync(tenant: TenantPrincipal, input: { full: boolean }, context: ClientContext) {
    const orgId = tenant.membership.organizationId;
    const connection = await this.connection(orgId);
    if (!connection || connection.status === 'DISCONNECTED') {
      throw new AppError('NOT_FOUND', 'No CRM is connected.');
    }
    if (connection.status === 'TOKEN_INVALID') {
      throw new AppError('CONFLICT', 'Reconnect HubSpot before syncing.');
    }
    const runId = await this.db.transaction(async (tx) => {
      const id = await this.startRun(tx, {
        organizationId: orgId,
        connectionId: connection.id,
        trigger: 'MANUAL',
        mode: input.full || !connection.syncWatermark ? 'FULL' : 'INCREMENTAL',
        requestedByUserId: tenant.userId,
      });
      if (!id) throw new AppError('CONFLICT', 'A sync is already running.');
      await this.audit.record(
        {
          action: 'crm.sync_requested',
          organizationId: orgId,
          actorUserId: tenant.userId,
          resourceType: 'crm_sync_run',
          resourceId: id,
        },
        context,
        tx,
      );
      return id;
    });
    return { id: runId };
  }

  /** Creates a run unless one is already queued or running; returns its id or null. */
  async startRun(
    db: Database,
    input: {
      organizationId: string;
      connectionId: string;
      trigger: 'INITIAL' | 'MANUAL' | 'SCHEDULED';
      mode: 'FULL' | 'INCREMENTAL';
      requestedByUserId: string | null;
    },
  ): Promise<string | null> {
    const [run] = await db
      .insert(crmSyncRuns)
      .values({ ...input, cursor: { phase: 'contacts', after: null, step: 0 } })
      .onConflictDoNothing()
      .returning({ id: crmSyncRuns.id });
    if (!run) return null;
    await this.jobs.enqueue(
      {
        type: CRM_JOBS.sync,
        payload: { runId: run.id },
        organizationId: input.organizationId,
        idempotencyKey: `crm-sync:${run.id}:0`,
      },
      db,
    );
    return run.id;
  }

  /**
   * A valid access token for the connection, refreshed shortly before expiry. The row is locked
   * so concurrent jobs never race a refresh (HubSpot may rotate the refresh token).
   */
  async accessToken(connectionId: string): Promise<{ token: string; connection: Connection }> {
    return this.db.transaction(async (tx) => {
      const [connection] = await tx
        .select()
        .from(crmConnections)
        .where(eq(crmConnections.id, connectionId))
        .for('update');
      if (!connection?.accessTokenEncrypted || !connection.refreshTokenEncrypted) {
        throw new CrmAuthError('No stored credentials');
      }
      const expiresAt = connection.accessTokenExpiresAt?.getTime() ?? 0;
      if (expiresAt - Date.now() > REFRESH_MARGIN_MS) {
        return { token: this.cipher.decrypt(connection.accessTokenEncrypted), connection };
      }
      const tokens = await this.crm.refresh(this.cipher.decrypt(connection.refreshTokenEncrypted));
      await tx
        .update(crmConnections)
        .set({
          accessTokenEncrypted: this.cipher.encrypt(tokens.accessToken),
          refreshTokenEncrypted: this.cipher.encrypt(tokens.refreshToken),
          accessTokenExpiresAt: tokens.expiresAt,
          ...(tokens.scopes.length ? { scopes: tokens.scopes } : {}),
        })
        .where(eq(crmConnections.id, connectionId));
      return { token: tokens.accessToken, connection };
    });
  }

  /** FR-85: the CRM rejected our grant; only reconnecting fixes it. */
  async markTokenInvalid(connection: Connection, message: string): Promise<void> {
    await this.db
      .update(crmConnections)
      .set({ status: 'TOKEN_INVALID', lastError: message })
      .where(and(eq(crmConnections.id, connection.id), ne(crmConnections.status, 'DISCONNECTED')));
    await this.audit.record({
      action: 'crm.token_invalid',
      organizationId: connection.organizationId,
      resourceType: 'crm_connection',
      resourceId: connection.id,
    });
  }

  private async connection(organizationId: string): Promise<Connection | null> {
    const [connection] = await this.db
      .select()
      .from(crmConnections)
      .where(
        and(
          eq(crmConnections.organizationId, organizationId),
          eq(crmConnections.provider, this.crm.provider),
        ),
      )
      .limit(1);
    return connection ?? null;
  }
}
