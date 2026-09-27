import { Inject, Injectable } from '@nestjs/common';
import {
  agentTestSessions,
  agentVersions,
  aiAgents,
  organizations,
  users,
  type Database,
} from '@nivomi/database';
import { and, desc, eq } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import type { TenantPrincipal } from '../auth/principal.js';
import { AppError } from '../common/errors.js';
import type { ClientContext } from '../common/request-context.js';
import { Clock } from '../compliance/clock.js';
import { DATABASE } from '../database/database.module.js';
import { cleanText } from '../leads/normalize.js';
import {
  agentDefinitionSchema,
  definitionChecksum,
  starterDefinition,
  workflowProblems,
  type AgentDefinition,
} from './agent-definition.js';
import {
  ConversationEngine,
  type ConversationState,
  type Utterance,
} from './conversation-engine.js';
import { LLM_PROVIDER, LlmProviderError, type LLMProvider } from './llm-provider.js';

type AgentRow = typeof aiAgents.$inferSelect;
type Category = AgentRow['callCategory'];

const TEST_SESSION_TTL_MS = 24 * 3_600_000;
const notFound = () => new AppError('NOT_FOUND', 'AI agent not found.');

/** Parses stored or submitted JSON into a definition, as a client-facing validation error. */
export function parseDefinition(input: unknown): AgentDefinition {
  const result = agentDefinitionSchema.safeParse(input);
  if (result.success) return result.data;
  throw new AppError('VALIDATION_ERROR', 'The agent definition is invalid.', {
    details: result.error.issues.slice(0, 20).map((i) => {
      const path = i.path.map(String).join('.');
      return path ? `${path}: ${i.message}` : i.message;
    }),
  });
}

export interface TestTranscriptEntry extends Utterance {
  readonly at: string;
}

/** AI Agents, published versions and browser test chat (PRD FR-26–FR-32, ADR-022). */
@Injectable()
export class AgentsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly clock: Clock,
    @Inject(LLM_PROVIDER) private readonly llm: LLMProvider,
  ) {}

  private async row(tenant: TenantPrincipal, id: string, db: Database = this.db, lock = false) {
    const query = db
      .select()
      .from(aiAgents)
      .where(
        and(eq(aiAgents.id, id), eq(aiAgents.organizationId, tenant.membership.organizationId)),
      )
      .limit(1);
    const [agent] = lock ? await query.for('update') : await query;
    if (!agent) throw notFound();
    return agent;
  }

  async list(tenant: TenantPrincipal) {
    const rows = await this.db
      .select()
      .from(aiAgents)
      .where(eq(aiAgents.organizationId, tenant.membership.organizationId))
      .orderBy(desc(aiAgents.createdAt), desc(aiAgents.id))
      .limit(200);
    const versions = await this.db
      .select({
        id: agentVersions.id,
        agentId: agentVersions.agentId,
        version: agentVersions.version,
      })
      .from(agentVersions)
      .where(eq(agentVersions.organizationId, tenant.membership.organizationId));
    return {
      items: rows.map((a) => {
        const definition = agentDefinitionSchema.safeParse(a.definition);
        const latest = versions.find((v) => v.agentId === a.id && v.version === a.latestVersion);
        return {
          id: a.id,
          name: a.name,
          status: a.status,
          callCategory: a.callCategory,
          latestVersion: a.latestVersion,
          latestVersionId: latest?.id ?? null,
          personaName: definition.success ? definition.data.personaName : null,
          primaryLanguage: definition.success ? definition.data.primaryLanguage : null,
          otherLanguages: definition.success ? definition.data.otherLanguages : [],
          tools: definition.success ? definition.data.tools : [],
          updatedAt: a.updatedAt,
        };
      }),
    };
  }

  async create(
    tenant: TenantPrincipal,
    input: { name: string; callCategory: Category; purpose?: string | null | undefined },
    context: ClientContext,
  ) {
    const orgId = tenant.membership.organizationId;
    const [organization] = await this.db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, orgId));
    const definition = starterDefinition({
      companyName: organization?.name ?? 'our company',
      purpose: cleanText(input.purpose, 300) ?? undefined,
    });
    return this.db.transaction(async (tx) => {
      const [agent] = await tx
        .insert(aiAgents)
        .values({
          organizationId: orgId,
          name: cleanText(input.name, 120) ?? 'New agent',
          callCategory: input.callCategory,
          definition,
          createdByUserId: tenant.userId,
        })
        .returning({ id: aiAgents.id });
      if (!agent) throw new Error('agent insert returned no row');
      await this.audit.record(
        {
          action: 'agent.created',
          organizationId: orgId,
          actorUserId: tenant.userId,
          resourceType: 'ai_agent',
          resourceId: agent.id,
        },
        context,
        tx,
      );
      return { id: agent.id };
    });
  }

  async get(tenant: TenantPrincipal, id: string) {
    const agent = await this.row(tenant, id);
    const definition = parseDefinition(agent.definition);
    const versions = await this.db
      .select({
        id: agentVersions.id,
        version: agentVersions.version,
        checksum: agentVersions.checksum,
        createdAt: agentVersions.createdAt,
        publishedBy: users.name,
      })
      .from(agentVersions)
      .leftJoin(users, eq(users.id, agentVersions.publishedByUserId))
      .where(
        and(eq(agentVersions.agentId, id), eq(agentVersions.organizationId, agent.organizationId)),
      )
      .orderBy(desc(agentVersions.version));
    const checksum = definitionChecksum(definition);
    return {
      id: agent.id,
      name: agent.name,
      status: agent.status,
      callCategory: agent.callCategory,
      latestVersion: agent.latestVersion,
      definition,
      problems: workflowProblems(definition),
      unpublishedChanges: versions[0]?.checksum !== checksum,
      versions: versions.map(({ checksum: _checksum, ...v }) => v),
      updatedAt: agent.updatedAt,
    };
  }

  /** Saves the draft. The graph may be unfinished; problems are returned, not rejected. */
  async update(
    tenant: TenantPrincipal,
    id: string,
    input: { name?: string | undefined; callCategory?: Category | undefined; definition?: unknown },
    context: ClientContext,
  ) {
    const definition =
      input.definition === undefined ? undefined : parseDefinition(input.definition);
    await this.db.transaction(async (tx) => {
      const agent = await this.row(tenant, id, tx, true);
      if (agent.status === 'ARCHIVED') throw new AppError('CONFLICT', 'This agent is archived.');
      await tx
        .update(aiAgents)
        .set({
          ...(input.name !== undefined ? { name: cleanText(input.name, 120) ?? agent.name } : {}),
          ...(input.callCategory ? { callCategory: input.callCategory } : {}),
          ...(definition ? { definition } : {}),
        })
        .where(eq(aiAgents.id, id));
      await this.audit.record(
        {
          action: 'agent.updated',
          organizationId: agent.organizationId,
          actorUserId: tenant.userId,
          resourceType: 'ai_agent',
          resourceId: id,
          metadata: {
            fields: Object.keys(input).filter((k) => input[k as keyof typeof input] !== undefined),
          },
        },
        context,
        tx,
      );
    });
    return this.get(tenant, id);
  }

  /** FR-32: freezes the draft as an immutable Agent Version. */
  async publish(tenant: TenantPrincipal, id: string, context: ClientContext) {
    const published = await this.db.transaction(async (tx) => {
      const agent = await this.row(tenant, id, tx, true);
      if (agent.status === 'ARCHIVED') throw new AppError('CONFLICT', 'This agent is archived.');
      const definition = parseDefinition(agent.definition);
      const problems = workflowProblems(definition);
      if (problems.length > 0) {
        throw new AppError('VALIDATION_ERROR', 'Fix the workflow before publishing.', {
          details: problems,
        });
      }
      const checksum = definitionChecksum(definition);
      const [latest] = await tx
        .select({ checksum: agentVersions.checksum, callCategory: agentVersions.callCategory })
        .from(agentVersions)
        .where(and(eq(agentVersions.agentId, id), eq(agentVersions.version, agent.latestVersion)));
      if (latest?.checksum === checksum && latest.callCategory === agent.callCategory) {
        throw new AppError('CONFLICT', `Nothing changed since version ${agent.latestVersion}.`);
      }
      const version = agent.latestVersion + 1;
      const [row] = await tx
        .insert(agentVersions)
        .values({
          organizationId: agent.organizationId,
          agentId: id,
          version,
          callCategory: agent.callCategory,
          definition,
          checksum,
          publishedByUserId: tenant.userId,
        })
        .returning({ id: agentVersions.id });
      if (!row) throw new Error('version insert returned no row');
      await tx
        .update(aiAgents)
        .set({ latestVersion: version, status: 'ACTIVE' })
        .where(eq(aiAgents.id, id));
      await this.audit.record(
        {
          action: 'agent.published',
          organizationId: agent.organizationId,
          actorUserId: tenant.userId,
          resourceType: 'ai_agent',
          resourceId: id,
          metadata: { version, versionId: row.id, checksum },
        },
        context,
        tx,
      );
      return { id: row.id, version };
    });
    return published;
  }

  /** Archived agents keep their versions (running campaigns still use them). */
  async archive(tenant: TenantPrincipal, id: string, context: ClientContext) {
    await this.db.transaction(async (tx) => {
      const agent = await this.row(tenant, id, tx, true);
      if (agent.status === 'ARCHIVED') return;
      await tx.update(aiAgents).set({ status: 'ARCHIVED' }).where(eq(aiAgents.id, id));
      await this.audit.record(
        {
          action: 'agent.archived',
          organizationId: agent.organizationId,
          actorUserId: tenant.userId,
          resourceType: 'ai_agent',
          resourceId: id,
        },
        context,
        tx,
      );
    });
  }

  async version(tenant: TenantPrincipal, agentId: string, versionId: string) {
    const [row] = await this.db
      .select()
      .from(agentVersions)
      .where(
        and(
          eq(agentVersions.id, versionId),
          eq(agentVersions.agentId, agentId),
          eq(agentVersions.organizationId, tenant.membership.organizationId),
        ),
      )
      .limit(1);
    if (!row) throw new AppError('NOT_FOUND', 'Agent version not found.');
    return {
      id: row.id,
      version: row.version,
      callCategory: row.callCategory,
      definition: parseDefinition(row.definition),
      createdAt: row.createdAt,
    };
  }

  // ── Test chat (Dograh-style "Test Chat"; FR-33 test calls come with telephony) ──

  async startTest(
    tenant: TenantPrincipal,
    agentId: string,
    input: { versionId?: string | null | undefined },
    context: ClientContext,
  ) {
    const agent = await this.row(tenant, agentId);
    const definition = input.versionId
      ? (await this.version(tenant, agentId, input.versionId)).definition
      : parseDefinition(agent.definition);
    const problems = workflowProblems(definition);
    if (problems.length > 0) {
      throw new AppError('VALIDATION_ERROR', 'Fix the workflow before testing it.', {
        details: problems,
      });
    }
    const opened = await this.withModel(() => new ConversationEngine(definition, this.llm).start());
    const now = this.clock.now();
    const transcript: TestTranscriptEntry[] = opened.utterances.map((u) => ({
      ...u,
      at: now.toISOString(),
    }));
    return this.db.transaction(async (tx) => {
      const [session] = await tx
        .insert(agentTestSessions)
        .values({
          organizationId: agent.organizationId,
          agentId,
          agentVersionId: input.versionId ?? null,
          definition,
          state: opened.state as unknown as Record<string, unknown>,
          transcript: transcript as unknown as Record<string, unknown>[],
          createdByUserId: tenant.userId,
          expiresAt: new Date(now.getTime() + TEST_SESSION_TTL_MS),
        })
        .returning();
      if (!session) throw new Error('test session insert returned no row');
      await this.audit.record(
        {
          action: 'agent.test_started',
          organizationId: agent.organizationId,
          actorUserId: tenant.userId,
          resourceType: 'ai_agent',
          resourceId: agentId,
          metadata: { sessionId: session.id, versionId: input.versionId ?? null },
        },
        context,
        tx,
      );
      return this.view(session);
    });
  }

  async getTest(tenant: TenantPrincipal, agentId: string, sessionId: string) {
    return this.view(await this.session(this.db, tenant, agentId, sessionId));
  }

  /**
   * One caller turn. `turn` is the number this turn will have: a replay of an already-processed
   * turn returns the stored conversation instead of advancing twice.
   */
  async testTurn(
    tenant: TenantPrincipal,
    agentId: string,
    sessionId: string,
    input: { turn: number; text: string },
  ) {
    return this.db.transaction(async (tx) => {
      const session = await this.session(tx, tenant, agentId, sessionId, true);
      if (input.turn <= session.turn) return this.view(session);
      if (input.turn !== session.turn + 1) {
        throw new AppError('CONFLICT', 'This conversation moved on; reload it.');
      }
      const now = this.clock.now();
      if (session.expiresAt <= now)
        throw new AppError('CONFLICT', 'This test conversation has expired.');
      const state = session.state as unknown as ConversationState;
      if (state.ended) throw new AppError('CONFLICT', 'This test conversation has ended.');
      const definition = parseDefinition(session.definition);
      const history = session.transcript as unknown as TestTranscriptEntry[];
      const text = input.text.trim().slice(0, 1_000);
      const result = await this.withModel(() =>
        new ConversationEngine(definition, this.llm).reply(state, text, history),
      );
      const transcript: TestTranscriptEntry[] = [
        ...history,
        { role: 'caller', text, at: now.toISOString() },
        ...result.utterances.map((u) => ({ ...u, at: now.toISOString() })),
      ];
      const [updated] = await tx
        .update(agentTestSessions)
        .set({
          state: result.state as unknown as Record<string, unknown>,
          transcript: transcript as unknown as Record<string, unknown>[],
          turn: input.turn,
        })
        .where(eq(agentTestSessions.id, session.id))
        .returning();
      if (!updated) throw new Error('test session update returned no row');
      return this.view(updated);
    });
  }

  private async session(
    db: Database,
    tenant: TenantPrincipal,
    agentId: string,
    sessionId: string,
    lock = false,
  ) {
    const query = db
      .select()
      .from(agentTestSessions)
      .where(
        and(
          eq(agentTestSessions.id, sessionId),
          eq(agentTestSessions.agentId, agentId),
          eq(agentTestSessions.organizationId, tenant.membership.organizationId),
        ),
      )
      .limit(1);
    const [session] = lock ? await query.for('update') : await query;
    if (!session) throw new AppError('NOT_FOUND', 'Test conversation not found.');
    return session;
  }

  private view(session: typeof agentTestSessions.$inferSelect) {
    const state = session.state as unknown as ConversationState;
    const definition = agentDefinitionSchema.parse(session.definition);
    return {
      id: session.id,
      agentId: session.agentId,
      versionId: session.agentVersionId,
      turn: session.turn,
      transcript: session.transcript as unknown as TestTranscriptEntry[],
      currentStep: state.nodeId,
      answers: state.answers,
      ended: state.ended,
      outcome: state.outcome,
      qualification: new ConversationEngine(definition, this.llm).qualification(state),
      expiresAt: session.expiresAt,
    };
  }

  private async withModel<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof LlmProviderError) {
        throw new AppError('PROVIDER_ERROR', 'The AI model did not answer. Try again.');
      }
      throw error;
    }
  }
}
