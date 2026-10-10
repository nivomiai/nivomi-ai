import { Inject, Injectable } from '@nestjs/common';
import { organizationMembers, organizations, users, type Database } from '@nivomi/database';
import { and, desc, eq, ilike, inArray, lt, or, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { AuditService, type AuditAction } from '../audit/audit.service.js';
import { isPlatformProvisionedRole, type OrganizationRole } from '../authorization/permissions.js';
import { AppError } from '../common/errors.js';
import { decodeCursor, encodeCursor } from '../common/pagination.js';
import type { ClientContext } from '../common/request-context.js';
import { DATABASE } from '../database/database.module.js';

/** Statuses an organization can be in (PRD FR-7). */
export type OrganizationStatus = 'PENDING_APPROVAL' | 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
const ALL_STATUSES: readonly OrganizationStatus[] = [
  'PENDING_APPROVAL',
  'ACTIVE',
  'SUSPENDED',
  'CLOSED',
];

export interface PlatformOrganizationRow {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
  memberCount: number;
  createdAt: Date;
  createdBy: { id: string; email: string; name: string } | null;
}

export interface PlatformOrganizationPage {
  readonly items: readonly PlatformOrganizationRow[];
  readonly nextCursor: string | null;
}

interface ListOptions {
  readonly limit: number;
  readonly cursor?: string | undefined;
  readonly status?: OrganizationStatus | undefined;
  readonly query?: string | undefined;
}

interface TransitionOptions {
  readonly reason?: string | undefined;
}

export interface ProvisionOrganizationInput {
  readonly name: string;
  readonly role: OrganizationRole;
  readonly ownerUserId: string;
}

function slugify(name: string): string {
  const base = name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base || 'org';
}

/**
 * Super Admin operations on organizations (FR-115, FR-116). Never called from a tenant
 * endpoint — the platform controller wraps this with `@RequireSuperAdmin`. Every transition
 * is written together with its audit entry in one transaction so the log matches state.
 */
@Injectable()
export class PlatformOrganizationsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async list(options: ListOptions): Promise<PlatformOrganizationPage> {
    const after = decodeCursor(options.cursor);
    const trimmedQuery = options.query?.trim();
    const rows = await this.db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        status: organizations.status,
        createdAt: organizations.createdAt,
        createdByUserId: organizations.createdByUserId,
      })
      .from(organizations)
      .where(
        and(
          options.status ? eq(organizations.status, options.status) : undefined,
          trimmedQuery
            ? or(
                ilike(organizations.name, `%${trimmedQuery}%`),
                ilike(organizations.slug, `%${trimmedQuery}%`),
              )
            : undefined,
          after
            ? or(
                lt(organizations.createdAt, after.createdAt),
                and(eq(organizations.createdAt, after.createdAt), lt(organizations.id, after.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(organizations.createdAt), desc(organizations.id))
      .limit(options.limit + 1);

    const page = rows.slice(0, options.limit);
    const creatorIds = [
      ...new Set(page.map((r) => r.createdByUserId).filter((v): v is string => !!v)),
    ];
    const creators = creatorIds.length
      ? await this.db
          .select({ id: users.id, email: users.email, name: users.name })
          .from(users)
          .where(inArray(users.id, creatorIds))
      : [];
    const creatorById = new Map(creators.map((u) => [u.id, u]));

    // Count members per organization on the returned page only — cheaper than a global aggregate.
    // Both drivers (pg, PGlite) return `{ rows }` from a raw query; casts follow the pattern in
    // campaigns.service.ts.
    const memberCounts = page.length
      ? ((await this.db.execute(sql`
          select organization_id, count(*)::int as n
          from organization_members
          where organization_id in (${sql.join(
            page.map((r) => sql`${r.id}::uuid`),
            sql.raw(','),
          )})
          group by organization_id
        `)) as { rows: { organization_id: string; n: number }[] })
      : { rows: [] as { organization_id: string; n: number }[] };
    const countBy = new Map<string, number>();
    for (const row of memberCounts.rows) countBy.set(row.organization_id, Number(row.n));

    const items: PlatformOrganizationRow[] = page.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      status: r.status,
      memberCount: countBy.get(r.id) ?? 0,
      createdAt: r.createdAt,
      createdBy: r.createdByUserId ? (creatorById.get(r.createdByUserId) ?? null) : null,
    }));

    const last = page.at(-1);
    return {
      items,
      nextCursor:
        rows.length > options.limit && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  /**
   * Super Admin provisions an ORGANIZATION or CUSTOM_PLAN account for a given owner user and
   * seeds the first membership. Public /signup still creates INDV_USER through
   * {@link OrganizationsService.create}; those are refused here.
   */
  async provision(
    input: ProvisionOrganizationInput,
    actorUserId: string,
    context?: ClientContext,
  ): Promise<{ id: string; name: string; slug: string; role: OrganizationRole }> {
    if (!isPlatformProvisionedRole(input.role)) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Only ORGANIZATION and CUSTOM_PLAN accounts can be provisioned here.',
      );
    }
    return this.db.transaction(async (tx) => {
      const [owner] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, input.ownerUserId))
        .limit(1);
      if (!owner) throw new AppError('NOT_FOUND', 'Owner user not found.');

      let slug = slugify(input.name);
      const [taken] = await tx
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.slug, slug))
        .limit(1);
      if (taken) slug = `${slug}-${randomBytes(3).toString('hex')}`;

      const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const [organization] = await tx
        .insert(organizations)
        .values({
          name: input.name,
          slug,
          createdByUserId: actorUserId,
          status: 'ACTIVE',
          trialEndsAt,
        })
        .returning();
      if (!organization) throw new Error('organization insert returned no row');
      await tx
        .insert(organizationMembers)
        .values({ organizationId: organization.id, userId: owner.id, role: input.role });
      await this.audit.record(
        {
          action: 'platform.organization_provisioned',
          organizationId: organization.id,
          actorUserId,
          resourceType: 'organization',
          resourceId: organization.id,
          metadata: { role: input.role, ownerUserId: owner.id },
        },
        context,
        tx,
      );
      return {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        role: input.role,
      };
    });
  }

  approve(organizationId: string, actorUserId: string, context?: ClientContext): Promise<void> {
    return this.transition(organizationId, {
      from: ['PENDING_APPROVAL', 'SUSPENDED'],
      to: 'ACTIVE',
      action: 'platform.organization_approved',
      actorUserId,
      context,
    });
  }

  suspend(
    organizationId: string,
    actorUserId: string,
    options: TransitionOptions,
    context?: ClientContext,
  ): Promise<void> {
    return this.transition(organizationId, {
      from: ['ACTIVE', 'PENDING_APPROVAL'],
      to: 'SUSPENDED',
      action: 'platform.organization_suspended',
      actorUserId,
      reason: options.reason,
      context,
    });
  }

  reactivate(organizationId: string, actorUserId: string, context?: ClientContext): Promise<void> {
    return this.transition(organizationId, {
      from: ['SUSPENDED'],
      to: 'ACTIVE',
      action: 'platform.organization_reactivated',
      actorUserId,
      context,
    });
  }

  close(
    organizationId: string,
    actorUserId: string,
    options: TransitionOptions,
    context?: ClientContext,
  ): Promise<void> {
    return this.transition(organizationId, {
      from: ['ACTIVE', 'SUSPENDED', 'PENDING_APPROVAL'],
      to: 'CLOSED',
      action: 'platform.organization_closed',
      actorUserId,
      reason: options.reason,
      context,
    });
  }

  private async transition(
    organizationId: string,
    step: {
      from: readonly OrganizationStatus[];
      to: OrganizationStatus;
      action: AuditAction;
      actorUserId: string;
      reason?: string | undefined;
      context?: ClientContext | undefined;
    },
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [current] = await tx
        .select({ id: organizations.id, status: organizations.status, name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .for('update');
      if (!current) throw new AppError('NOT_FOUND', 'Organization not found.');
      // Idempotency: retries and duplicate clicks on the same action succeed with no state
      // change, and no audit entry.
      if (current.status === step.to) return;
      if (!step.from.includes(current.status)) {
        throw new AppError(
          'CONFLICT',
          `This organization is ${current.status.toLowerCase().replace('_', ' ')}; the action does not apply.`,
        );
      }
      await tx
        .update(organizations)
        .set({ status: step.to })
        .where(eq(organizations.id, organizationId));
      const reason = step.reason?.trim();
      await this.audit.record(
        {
          action: step.action,
          organizationId,
          actorUserId: step.actorUserId,
          resourceType: 'organization',
          resourceId: organizationId,
          metadata: {
            from: current.status,
            to: step.to,
            ...(reason ? { reason } : {}),
          },
        },
        step.context,
        tx,
      );
    });
  }

  static isValidStatus(value: unknown): value is OrganizationStatus {
    return typeof value === 'string' && ALL_STATUSES.includes(value as OrganizationStatus);
  }
}
