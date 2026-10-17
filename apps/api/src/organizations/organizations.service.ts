import { Inject, Injectable } from '@nestjs/common';
import {
  organizationInvitations,
  organizationMembers,
  organizations,
  sessions,
  users,
  type Database,
} from '@nivomi/database';
import { and, asc, desc, eq, gt, isNull } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { AuditService } from '../audit/audit.service.js';
import type { Principal, TenantPrincipal } from '../auth/principal.js';
import { hashToken } from '../auth/tokens.js';
import { isMultiMemberRole, type OrganizationRole } from '../authorization/permissions.js';
import { AppError } from '../common/errors.js';
import type { ClientContext } from '../common/request-context.js';
import { DATABASE } from '../database/database.module.js';
import { JobQueue } from '../jobs/jobs.js';
import { RATE_LIMITS, RateLimiter } from '../security/rate-limit.js';

export const ORGANIZATION_JOBS = { sendInvitationEmail: 'email.invitation' } as const;
export const INVITATION_TTL_MS = 7 * 24 * 60 * 60_000;
/** Length of the free trial every new organization gets at creation. */
export const TRIAL_DAYS = 7;

export interface OrganizationSummary {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly status: string;
  readonly role: OrganizationRole;
  /** 7-day free-trial deadline (ISO) or null for pre-trial orgs. */
  readonly trialEndsAt: Date | null;
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

const notFound = () => new AppError('NOT_FOUND', 'Not found.');

@Injectable()
export class OrganizationsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly jobs: JobQueue,
    private readonly limiter: RateLimiter,
  ) {}

  /**
   * Creates the caller's own solo workspace. Public /signup → one INDV_USER workspace per user.
   * Multi-member accounts (ORGANIZATION, CUSTOM_PLAN) are provisioned by a Super Admin and come
   * through {@link PlatformOrganizationsService} instead.
   */
  async create(
    principal: Principal,
    name: string,
    context: ClientContext,
  ): Promise<OrganizationSummary> {
    return this.db.transaction(async (tx) => {
      let slug = slugify(name);
      const [taken] = await tx
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.slug, slug))
        .limit(1);
      if (taken) slug = `${slug}-${randomBytes(3).toString('hex')}`;

      const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
      const [organization] = await tx
        .insert(organizations)
        .values({ name, slug, createdByUserId: principal.userId, trialEndsAt })
        .returning();
      if (!organization) throw new Error('organization insert returned no row');
      await tx
        .insert(organizationMembers)
        .values({ organizationId: organization.id, userId: principal.userId, role: 'INDV_USER' });
      await tx
        .update(sessions)
        .set({ activeOrganizationId: organization.id })
        .where(eq(sessions.id, principal.sessionId));
      await this.audit.record(
        {
          action: 'organization.created',
          organizationId: organization.id,
          actorUserId: principal.userId,
          resourceType: 'organization',
          resourceId: organization.id,
          metadata: { role: 'INDV_USER' },
        },
        context,
        tx,
      );
      return {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        status: organization.status,
        role: 'INDV_USER',
        trialEndsAt: organization.trialEndsAt,
      };
    });
  }

  async listForUser(userId: string): Promise<OrganizationSummary[]> {
    return this.db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        status: organizations.status,
        role: organizationMembers.role,
        trialEndsAt: organizations.trialEndsAt,
      })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
      .where(eq(organizationMembers.userId, userId))
      .orderBy(asc(organizations.name))
      .limit(200);
  }

  /** Switches the session's organization. Membership is verified; a non-member sees NOT_FOUND. */
  async switchActive(
    principal: Principal,
    organizationId: string,
    context: ClientContext,
  ): Promise<void> {
    const [member] = await this.db
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.userId, principal.userId),
        ),
      )
      .limit(1);
    if (!member) {
      await this.recordCrossTenantAttempt(principal, 'organization', organizationId, context);
      throw notFound();
    }
    await this.db
      .update(sessions)
      .set({ activeOrganizationId: organizationId })
      .where(eq(sessions.id, principal.sessionId));
    await this.audit.record(
      {
        action: 'organization.switched',
        organizationId,
        actorUserId: principal.userId,
        resourceType: 'organization',
        resourceId: organizationId,
      },
      context,
    );
  }

  async getActive(tenant: TenantPrincipal): Promise<OrganizationSummary> {
    const [organization] = await this.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, tenant.membership.organizationId))
      .limit(1);
    if (!organization) throw notFound();
    return {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      status: organization.status,
      role: tenant.membership.role,
      trialEndsAt: organization.trialEndsAt,
    };
  }

  async listMembers(tenant: TenantPrincipal) {
    return this.db
      .select({
        id: organizationMembers.id,
        userId: users.id,
        name: users.name,
        email: users.email,
        role: organizationMembers.role,
        joinedAt: organizationMembers.createdAt,
      })
      .from(organizationMembers)
      .innerJoin(users, eq(users.id, organizationMembers.userId))
      .where(eq(organizationMembers.organizationId, tenant.membership.organizationId))
      .orderBy(asc(users.name))
      .limit(500);
  }

  /**
   * Removes a member (or lets a member leave). An account must keep at least one member; the
   * last one cannot be removed. There are no sub-roles to switch between in the new model.
   */
  async removeMember(
    tenant: TenantPrincipal,
    memberId: string,
    context: ClientContext,
  ): Promise<void> {
    await this.assertInTenant(tenant, 'member', memberId, context);
    await this.db.transaction(async (tx) => {
      const member = await this.lockMember(tx, tenant.membership.organizationId, memberId);
      const leaving = member.userId === tenant.userId;
      await this.assertAnotherMember(tx, tenant.membership.organizationId);
      await tx.delete(organizationMembers).where(eq(organizationMembers.id, member.id));
      await tx
        .update(sessions)
        .set({ activeOrganizationId: null })
        .where(
          and(
            eq(sessions.userId, member.userId),
            eq(sessions.activeOrganizationId, tenant.membership.organizationId),
          ),
        );
      await this.audit.record(
        {
          action: 'organization.member_removed',
          organizationId: tenant.membership.organizationId,
          actorUserId: tenant.userId,
          resourceType: 'member',
          resourceId: member.id,
          metadata: { userId: member.userId, role: member.role, leaving },
        },
        context,
        tx,
      );
    });
  }

  async leave(tenant: TenantPrincipal, context: ClientContext): Promise<void> {
    const [own] = await this.db
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, tenant.membership.organizationId),
          eq(organizationMembers.userId, tenant.userId),
        ),
      )
      .limit(1);
    if (!own) throw notFound();
    await this.removeMember(tenant, own.id, context);
  }

  /**
   * Invites someone to this tenant. New members always inherit the tenant's own role
   * (ORGANIZATION or CUSTOM_PLAN); solo INDV_USER accounts cannot invite. There is no
   * per-invitation role picker anymore.
   */
  async invite(
    tenant: TenantPrincipal,
    input: { email: string },
    context: ClientContext,
  ): Promise<{ id: string; email: string; role: OrganizationRole; expiresAt: Date }> {
    const organizationId = tenant.membership.organizationId;
    if (!isMultiMemberRole(tenant.membership.role)) {
      throw new AppError(
        'AUTHORIZATION_ERROR',
        'This account cannot invite members. Contact support to upgrade your plan.',
      );
    }
    const role: OrganizationRole = tenant.membership.role;
    await this.limiter.consume(RATE_LIMITS.invitationsPerOrganization, organizationId);

    const [alreadyMember] = await this.db
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .innerJoin(users, eq(users.id, organizationMembers.userId))
      .where(
        and(eq(organizationMembers.organizationId, organizationId), eq(users.email, input.email)),
      )
      .limit(1);
    if (alreadyMember) throw new AppError('CONFLICT', 'This person is already a member.');

    return this.db.transaction(async (tx) => {
      // The real token is minted when the email is sent (the job); until then nothing can redeem it.
      const placeholderHash = hashToken(randomBytes(32).toString('base64url'));
      const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
      const inserted = await tx
        .insert(organizationInvitations)
        .values({
          organizationId,
          email: input.email,
          role,
          tokenHash: placeholderHash,
          invitedByUserId: tenant.userId,
          expiresAt,
        })
        .onConflictDoNothing()
        .returning({ id: organizationInvitations.id });
      const invitation = inserted[0];
      if (!invitation) {
        throw new AppError('CONFLICT', 'An invitation for this email is already pending.');
      }
      await this.jobs.enqueue(
        {
          type: ORGANIZATION_JOBS.sendInvitationEmail,
          payload: { invitationId: invitation.id },
          organizationId,
        },
        tx,
      );
      await this.audit.record(
        {
          action: 'organization.invitation_created',
          organizationId,
          actorUserId: tenant.userId,
          resourceType: 'invitation',
          resourceId: invitation.id,
          metadata: { role },
        },
        context,
        tx,
      );
      return { id: invitation.id, email: input.email, role, expiresAt };
    });
  }

  async listInvitations(tenant: TenantPrincipal) {
    return this.db
      .select({
        id: organizationInvitations.id,
        email: organizationInvitations.email,
        role: organizationInvitations.role,
        createdAt: organizationInvitations.createdAt,
        expiresAt: organizationInvitations.expiresAt,
      })
      .from(organizationInvitations)
      .where(
        and(
          eq(organizationInvitations.organizationId, tenant.membership.organizationId),
          isNull(organizationInvitations.acceptedAt),
          isNull(organizationInvitations.revokedAt),
          gt(organizationInvitations.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(organizationInvitations.createdAt))
      .limit(200);
  }

  async revokeInvitation(
    tenant: TenantPrincipal,
    invitationId: string,
    context: ClientContext,
  ): Promise<void> {
    const [revoked] = await this.db
      .update(organizationInvitations)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(organizationInvitations.id, invitationId),
          eq(organizationInvitations.organizationId, tenant.membership.organizationId),
          isNull(organizationInvitations.acceptedAt),
          isNull(organizationInvitations.revokedAt),
        ),
      )
      .returning({ id: organizationInvitations.id });
    if (!revoked) {
      await this.assertInTenant(tenant, 'invitation', invitationId, context);
      throw notFound();
    }
    await this.audit.record(
      {
        action: 'organization.invitation_revoked',
        organizationId: tenant.membership.organizationId,
        actorUserId: tenant.userId,
        resourceType: 'invitation',
        resourceId: invitationId,
      },
      context,
    );
  }

  /** Accepts an invitation addressed to the caller's (verified) email and switches to that org. */
  async acceptInvitation(
    principal: Principal,
    token: string,
    context: ClientContext,
  ): Promise<OrganizationSummary> {
    await this.limiter.consume(RATE_LIMITS.tokenRedeemPerIp, context.ipAddress);
    return this.db.transaction(async (tx) => {
      const [invitation] = await tx
        .select()
        .from(organizationInvitations)
        .where(
          and(
            eq(organizationInvitations.tokenHash, hashToken(token)),
            isNull(organizationInvitations.acceptedAt),
            isNull(organizationInvitations.revokedAt),
            gt(organizationInvitations.expiresAt, new Date()),
          ),
        )
        .limit(1)
        .for('update');
      if (!invitation) {
        throw new AppError('VALIDATION_ERROR', 'This invitation is invalid or has expired.');
      }
      if (invitation.email !== principal.email) {
        throw new AppError(
          'AUTHORIZATION_ERROR',
          'This invitation was sent to a different email address.',
        );
      }
      await tx
        .insert(organizationMembers)
        .values({
          organizationId: invitation.organizationId,
          userId: principal.userId,
          role: invitation.role,
        })
        .onConflictDoNothing();
      await tx
        .update(organizationInvitations)
        .set({ acceptedAt: new Date() })
        .where(eq(organizationInvitations.id, invitation.id));
      await tx
        .update(sessions)
        .set({ activeOrganizationId: invitation.organizationId })
        .where(eq(sessions.id, principal.sessionId));
      await this.audit.record(
        {
          action: 'organization.invitation_accepted',
          organizationId: invitation.organizationId,
          actorUserId: principal.userId,
          resourceType: 'invitation',
          resourceId: invitation.id,
        },
        context,
        tx,
      );
      const [organization] = await tx
        .select()
        .from(organizations)
        .where(eq(organizations.id, invitation.organizationId))
        .limit(1);
      if (!organization) throw notFound();
      const [membership] = await tx
        .select({ role: organizationMembers.role })
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, organization.id),
            eq(organizationMembers.userId, principal.userId),
          ),
        )
        .limit(1);
      return {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        status: organization.status,
        role: membership?.role ?? invitation.role,
        trialEndsAt: organization.trialEndsAt,
      };
    });
  }

  /**
   * PRD FR-1: an identifier that belongs to another organization answers NOT_FOUND (never
   * "forbidden", which would confirm it exists) and leaves a platform-level audit event.
   */
  private async assertInTenant(
    tenant: TenantPrincipal,
    resourceType: 'member' | 'invitation',
    resourceId: string,
    context: ClientContext,
  ): Promise<void> {
    const table = resourceType === 'member' ? organizationMembers : organizationInvitations;
    const [row] = await this.db
      .select({ organizationId: table.organizationId })
      .from(table)
      .where(eq(table.id, resourceId))
      .limit(1);
    if (row && row.organizationId !== tenant.membership.organizationId) {
      await this.recordCrossTenantAttempt(tenant, resourceType, resourceId, context);
      throw notFound();
    }
  }

  private async recordCrossTenantAttempt(
    principal: Principal,
    resourceType: string,
    resourceId: string,
    context: ClientContext,
  ): Promise<void> {
    await this.audit.record(
      {
        action: 'security.cross_tenant_access_denied',
        // Platform-level: the event belongs to neither tenant's own log.
        organizationId: null,
        actorUserId: principal.userId,
        resourceType,
        resourceId,
        metadata: { activeOrganizationId: principal.membership?.organizationId ?? null },
      },
      context,
    );
  }

  private async lockMember(tx: Database, organizationId: string, memberId: string) {
    const [member] = await tx
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.id, memberId),
          eq(organizationMembers.organizationId, organizationId),
        ),
      )
      .limit(1)
      .for('update');
    if (!member) throw notFound();
    return member;
  }

  /** Account must keep at least one member; the caller performs the delete after this check. */
  private async assertAnotherMember(tx: Database, organizationId: string): Promise<void> {
    const rows = await tx
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(eq(organizationMembers.organizationId, organizationId))
      .limit(2);
    if (rows.length < 2) {
      throw new AppError('CONFLICT', 'An account must keep at least one member.');
    }
  }
}
