import { Inject, Injectable } from '@nestjs/common';
import { organizationMembers, organizations, users, type Database } from '@nivomi/database';
import { and, desc, eq, ilike, inArray, lt, or } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { AppError } from '../common/errors.js';
import { decodeCursor, encodeCursor } from '../common/pagination.js';
import type { ClientContext } from '../common/request-context.js';
import { DATABASE } from '../database/database.module.js';
import type { OrganizationRole } from '../authorization/permissions.js';

export interface PlatformUserRow {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly isSuperAdmin: boolean;
  readonly emailVerifiedAt: Date | null;
  readonly createdAt: Date;
  readonly memberships: readonly {
    readonly organizationId: string;
    readonly organizationName: string;
    readonly role: OrganizationRole;
  }[];
}

export interface PlatformUserPage {
  readonly items: readonly PlatformUserRow[];
  readonly nextCursor: string | null;
}

interface ListOptions {
  readonly limit: number;
  readonly cursor?: string | undefined;
  readonly query?: string | undefined;
  readonly superAdminsOnly?: boolean | undefined;
}

/**
 * Super Admin operations on individual users (platform FR-115 extension). Grants and revokes the
 * platform flag; the flag is stored only in Nivomi's DB and never inherited from a tenant role.
 * Every change is written together with its audit entry in one transaction.
 */
@Injectable()
export class PlatformUsersService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async list(options: ListOptions): Promise<PlatformUserPage> {
    const after = decodeCursor(options.cursor);
    const trimmed = options.query?.trim();
    const rows = await this.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        isSuperAdmin: users.isSuperAdmin,
        emailVerifiedAt: users.emailVerifiedAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(
        and(
          options.superAdminsOnly ? eq(users.isSuperAdmin, true) : undefined,
          trimmed
            ? or(ilike(users.email, `%${trimmed}%`), ilike(users.name, `%${trimmed}%`))
            : undefined,
          after
            ? or(
                lt(users.createdAt, after.createdAt),
                and(eq(users.createdAt, after.createdAt), lt(users.id, after.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(users.createdAt), desc(users.id))
      .limit(options.limit + 1);

    const page = rows.slice(0, options.limit);
    const userIds = page.map((row) => row.id);
    const memberships = userIds.length
      ? await this.db
          .select({
            userId: organizationMembers.userId,
            organizationId: organizations.id,
            organizationName: organizations.name,
            role: organizationMembers.role,
          })
          .from(organizationMembers)
          .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
          .where(inArray(organizationMembers.userId, userIds))
      : [];
    const byUser = new Map<string, PlatformUserRow['memberships'][number][]>();
    for (const row of memberships) {
      const list = byUser.get(row.userId) ?? [];
      list.push({
        organizationId: row.organizationId,
        organizationName: row.organizationName,
        role: row.role,
      });
      byUser.set(row.userId, list);
    }

    const items: PlatformUserRow[] = page.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      isSuperAdmin: row.isSuperAdmin,
      emailVerifiedAt: row.emailVerifiedAt,
      createdAt: row.createdAt,
      memberships: byUser.get(row.id) ?? [],
    }));

    const last = page.at(-1);
    return {
      items,
      nextCursor:
        rows.length > options.limit && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  promote(targetUserId: string, actorUserId: string, context?: ClientContext): Promise<void> {
    return this.setSuperAdmin(targetUserId, actorUserId, true, context);
  }

  demote(targetUserId: string, actorUserId: string, context?: ClientContext): Promise<void> {
    return this.setSuperAdmin(targetUserId, actorUserId, false, context);
  }

  private async setSuperAdmin(
    targetUserId: string,
    actorUserId: string,
    next: boolean,
    context?: ClientContext,
  ): Promise<void> {
    if (targetUserId === actorUserId && !next) {
      throw new AppError(
        'CONFLICT',
        'You cannot remove your own Super Admin flag. Ask another Super Admin to do it.',
      );
    }
    await this.db.transaction(async (tx) => {
      const [current] = await tx
        .select({ id: users.id, isSuperAdmin: users.isSuperAdmin, email: users.email })
        .from(users)
        .where(eq(users.id, targetUserId))
        .for('update');
      if (!current) throw new AppError('NOT_FOUND', 'User not found.');
      if (current.isSuperAdmin === next) return; // idempotent — no state change, no audit entry
      await tx.update(users).set({ isSuperAdmin: next }).where(eq(users.id, targetUserId));
      await this.audit.record(
        {
          action: next ? 'platform.user_promoted' : 'platform.user_demoted',
          organizationId: null,
          actorUserId,
          resourceType: 'user',
          resourceId: targetUserId,
          metadata: { email: current.email },
        },
        context,
        tx,
      );
    });
  }
}
