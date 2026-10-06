import {
  agentVersions,
  aiAgents,
  callerNumbers,
  campaigns,
  organizationInvitations,
  organizationMembers,
  organizations,
  plans,
  telecomIdentities,
  users,
  type Database,
} from '@nivomi/database';
import { and, eq, isNull } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { hashPassword } from '../auth/password.js';
import { hashToken } from '../auth/tokens.js';
import { definitionChecksum, starterDefinition } from '../agents/agent-definition.js';
import { classifyNumberSeries } from '../compliance/compliance-engine.js';
import { INDIA_RULE_SET_V1 } from '../compliance/rule-sets/india-v1.js';
import { IngestionEngine, lockOrganizationIngestion } from '../leads/ingestion.js';
import { DEV_CALLING, DEV_LEADS, DEV_ORGANIZATIONS, DEV_PASSWORD, DEV_USERS } from './seed-data.js';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

export interface DevSeedResult {
  /** Seeded user id by email. */
  readonly userIds: ReadonlyMap<string, string>;
  /** Seeded organization id by slug. */
  readonly organizationIds: ReadonlyMap<string, string>;
  /** Leads created on this run (0 when they all existed already). */
  readonly leadsCreated: number;
  /** Demo campaigns created on this run. */
  readonly campaignsCreated: number;
}

/**
 * Brings the development dataset to its declared state: accounts (password, verification,
 * lockout, Super Admin), organization status, memberships, open invitations, demo leads and the
 * calling demo. Rows it does not declare are left alone. Safe to run on every start.
 */
export async function seedDevData(db: Database): Promise<DevSeedResult> {
  const accounts = await seedAccounts(db);
  const leadsCreated = await seedLeads(db, accounts.userIds, accounts.organizationIds);
  const campaignsCreated = await seedCalling(db, accounts.userIds, accounts.organizationIds);
  await seedPlans(db);
  return { ...accounts, leadsCreated, campaignsCreated };
}

/**
 * Placeholder plan catalogue so the marketing homepage shows something in dev. These are
 * illustrative — a Super Admin can edit prices and limits in /app/platform/plans. Idempotent
 * on `code`: existing rows are left alone so admin edits survive reseeds.
 */
async function seedPlans(db: Database): Promise<void> {
  const DEV_PLANS = [
    {
      code: 'starter',
      name: 'Starter',
      monthlyPaiseInr: 199900,
      displayOrder: 10,
      limits: { CALL_MINUTES_OUTBOUND: 2000 } as Record<string, number>,
      overageRates: { CALL_MINUTES_OUTBOUND: 300 } as Record<string, number>,
    },
    {
      code: 'growth',
      name: 'Growth',
      monthlyPaiseInr: 999900,
      displayOrder: 20,
      limits: { CALL_MINUTES_OUTBOUND: 15000 } as Record<string, number>,
      overageRates: { CALL_MINUTES_OUTBOUND: 250 } as Record<string, number>,
    },
    {
      code: 'scale',
      name: 'Scale',
      monthlyPaiseInr: 0,
      displayOrder: 30,
      limits: {} as Record<string, number>,
      overageRates: {} as Record<string, number>,
    },
  ];
  for (const plan of DEV_PLANS) {
    await db.insert(plans).values(plan).onConflictDoNothing({ target: plans.code });
  }
}

/**
 * Calling demo: a verified telecom identity, a 140-series caller number and a DRAFT campaign.
 * Each is created once; edits made in the app are never overwritten.
 */
async function seedCalling(
  db: Database,
  userIds: ReadonlyMap<string, string>,
  organizationIds: ReadonlyMap<string, string>,
): Promise<number> {
  const superAdminId = userIds.get(DEV_USERS.find((u) => u.superAdmin)?.email ?? '') ?? null;
  const audit = new AuditService(db);
  let created = 0;
  for (const [slug, spec] of Object.entries(DEV_CALLING)) {
    const organizationId = organizationIds.get(slug);
    if (!organizationId) throw new Error(`seed calling references unknown organization ${slug}`);
    await db.transaction(async (tx) => {
      const now = new Date();
      const [identity] = await tx
        .insert(telecomIdentities)
        .values({
          organizationId,
          status: 'VERIFIED',
          ...spec.telecom,
          a2pDeclaredAt: new Date(now.getTime() - 30 * DAY_MS),
          selfCertifiedAt: new Date(now.getTime() - 30 * DAY_MS),
          submittedAt: now,
          reviewedAt: now,
          reviewedByUserId: superAdminId,
        })
        .onConflictDoNothing({ target: telecomIdentities.organizationId })
        .returning({ id: telecomIdentities.id });
      if (identity) {
        await audit.record(
          {
            action: 'telecom.identity_verified',
            organizationId,
            actorUserId: superAdminId,
            resourceType: 'telecom_identity',
            resourceId: identity.id,
            metadata: { source: 'dev-seed' },
          },
          undefined,
          tx,
        );
      }

      await tx
        .insert(callerNumbers)
        .values({
          organizationId,
          phoneE164: spec.callerNumber,
          series: classifyNumberSeries(INDIA_RULE_SET_V1.rules, spec.callerNumber) ?? 'unknown',
          purpose: 'PROMOTIONAL',
          a2pDeclared: true,
        })
        .onConflictDoNothing({ target: callerNumbers.phoneE164 });
      const [number] = await tx
        .select({ id: callerNumbers.id })
        .from(callerNumbers)
        .where(
          and(
            eq(callerNumbers.organizationId, organizationId),
            eq(callerNumbers.phoneE164, spec.callerNumber),
          ),
        );
      if (!number) throw new Error(`seed caller number ${spec.callerNumber} belongs elsewhere`);

      // No sub-roles anymore: the first listed member of each dev tenant is treated as creator.
      const ownerEmail = DEV_ORGANIZATIONS.find((o) => o.slug === slug)?.members[0]?.email;
      const ownerId = ownerEmail ? (userIds.get(ownerEmail) ?? null) : null;

      // The demo agent, published once as version 1 (FR-32).
      let [agent] = await tx
        .select({ id: aiAgents.id })
        .from(aiAgents)
        .where(
          and(eq(aiAgents.organizationId, organizationId), eq(aiAgents.name, spec.agent.name)),
        );
      if (!agent) {
        const [organization] = await tx
          .select({ name: organizations.name })
          .from(organizations)
          .where(eq(organizations.id, organizationId));
        const definition = starterDefinition({
          companyName: organization?.name ?? slug,
          personaName: spec.agent.personaName,
          purpose: spec.agent.purpose,
        });
        [agent] = await tx
          .insert(aiAgents)
          .values({
            organizationId,
            name: spec.agent.name,
            status: 'ACTIVE',
            callCategory: 'PROMOTIONAL',
            definition,
            latestVersion: 1,
            createdByUserId: ownerId,
          })
          .returning({ id: aiAgents.id });
        if (!agent) throw new Error('seed agent insert returned no row');
        await tx.insert(agentVersions).values({
          organizationId,
          agentId: agent.id,
          version: 1,
          callCategory: 'PROMOTIONAL',
          definition,
          checksum: definitionChecksum(definition),
          publishedByUserId: ownerId,
        });
      }
      const [version] = await tx
        .select({ id: agentVersions.id })
        .from(agentVersions)
        .where(and(eq(agentVersions.agentId, agent.id), eq(agentVersions.version, 1)));

      const [existing] = await tx
        .select({ id: campaigns.id, agentVersionId: campaigns.agentVersionId })
        .from(campaigns)
        .where(
          and(eq(campaigns.organizationId, organizationId), eq(campaigns.name, spec.campaign.name)),
        );
      if (existing) {
        // Campaigns seeded before agents existed get the demo agent; a Member's choice is kept.
        if (!existing.agentVersionId && version) {
          await tx
            .update(campaigns)
            .set({ agentVersionId: version.id })
            .where(eq(campaigns.id, existing.id));
        }
        return;
      }
      const [campaign] = await tx
        .insert(campaigns)
        .values({
          organizationId,
          name: spec.campaign.name,
          type: 'STATIC',
          callCategory: 'PROMOTIONAL',
          callerNumberId: number.id,
          agentVersionId: version?.id ?? null,
          selection: { kind: 'FILTER' },
          windowStart: spec.campaign.windowStart,
          windowEnd: spec.campaign.windowEnd,
          maxConcurrentCalls: 2,
          maxCallsPerHour: 60,
          maxAttempts: 3,
          retryIntervalMinutes: 240,
          maxAttemptsPerDay: 2,
          budgetMinutes: spec.campaign.budgetMinutes,
          createdByUserId: ownerId,
        })
        .returning({ id: campaigns.id });
      if (!campaign) throw new Error('seed campaign insert returned no row');
      created += 1;
      await audit.record(
        {
          action: 'campaign.created',
          organizationId,
          actorUserId: ownerId,
          resourceType: 'campaign',
          resourceId: campaign.id,
          metadata: { name: spec.campaign.name, source: 'dev-seed' },
        },
        undefined,
        tx,
      );
    });
  }
  return created;
}

/**
 * Leads go through the real ingestion engine, so a re-run matches every existing record (SKIP)
 * instead of duplicating it, and edits made in the app are never overwritten.
 */
async function seedLeads(
  db: Database,
  userIds: ReadonlyMap<string, string>,
  organizationIds: ReadonlyMap<string, string>,
): Promise<number> {
  let created = 0;
  for (const [slug, list] of Object.entries(DEV_LEADS)) {
    const organizationId = organizationIds.get(slug);
    if (!organizationId) throw new Error(`seed leads reference unknown organization ${slug}`);
    await db.transaction(async (tx) => {
      await lockOrganizationIngestion(tx, organizationId);
      const engine = new IngestionEngine(tx);
      for (const lead of list) {
        const result = await engine.ingest(
          {
            fullName: lead.fullName,
            phone: lead.phone,
            email: lead.email ?? null,
            company: lead.company ?? null,
            city: lead.city ?? null,
            leadStatus: lead.status,
            consentStatus: lead.consent ?? null,
            consentReference: lead.consentReference ?? null,
            sourceLabel: lead.consentSource ?? null,
          },
          {
            organizationId,
            source: lead.source,
            sourceReference: 'dev-seed',
            actorUserId: null,
            ownerUserId: lead.ownerEmail ? (userIds.get(lead.ownerEmail) ?? null) : null,
          },
        );
        if (result.outcome === 'INVALID' || result.outcome === 'REVIEW') {
          throw new Error(`seed lead ${lead.fullName} was not ingested (${result.outcome})`);
        }
        if (result.outcome === 'CREATE') created += 1;
      }
    });
  }
  return created;
}

async function seedAccounts(
  db: Database,
): Promise<Omit<DevSeedResult, 'leadsCreated' | 'campaignsCreated'>> {
  // One hash for the shared password keeps every start fast (Argon2id is deliberately slow).
  const passwordHash = await hashPassword(DEV_PASSWORD);
  const audit = new AuditService(db);

  return db.transaction(async (tx) => {
    const userIds = new Map<string, string>();
    for (const user of DEV_USERS) {
      const account = {
        name: user.name,
        passwordHash,
        emailVerifiedAt: user.verified ? new Date() : null,
        failedLoginCount: 0,
        lockedUntil: null,
        isSuperAdmin: user.superAdmin,
      };
      const [row] = await tx
        .insert(users)
        .values({ email: user.email, ...account })
        .onConflictDoUpdate({ target: users.email, set: account })
        .returning({ id: users.id });
      if (!row) throw new Error(`user upsert returned no row for ${user.email}`);
      userIds.set(user.email, row.id);
    }
    const userId = (email: string): string => {
      const id = userIds.get(email);
      if (!id) throw new Error(`seed data references unknown user ${email}`);
      return id;
    };
    const superAdminId = userId(DEV_USERS.find((u) => u.superAdmin)?.email ?? '');

    const organizationIds = new Map<string, string>();
    for (const org of DEV_ORGANIZATIONS) {
      // The first listed member of each dev tenant is recorded as the creator.
      const ownerEmail = org.members[0]?.email;
      if (!ownerEmail) throw new Error(`seed organization ${org.slug} has no members`);
      const ownerId = userId(ownerEmail);

      const [created] = await tx
        .insert(organizations)
        .values({ name: org.name, slug: org.slug, status: org.status, createdByUserId: ownerId })
        .onConflictDoNothing({ target: organizations.slug })
        .returning({ id: organizations.id });
      const [organization] = created
        ? [created]
        : await tx
            .update(organizations)
            .set({ status: org.status })
            .where(eq(organizations.slug, org.slug))
            .returning({ id: organizations.id });
      if (!organization) throw new Error(`organization upsert returned no row for ${org.slug}`);
      organizationIds.set(org.slug, organization.id);

      if (created) {
        await audit.record(
          {
            action: 'organization.created',
            organizationId: organization.id,
            actorUserId: ownerId,
            resourceType: 'organization',
            resourceId: organization.id,
            metadata: { source: 'dev-seed' },
          },
          undefined,
          tx,
        );
      }

      for (const member of org.members) {
        await tx
          .insert(organizationMembers)
          .values({
            organizationId: organization.id,
            userId: userId(member.email),
            role: member.role,
          })
          .onConflictDoUpdate({
            target: [organizationMembers.organizationId, organizationMembers.userId],
            set: { role: member.role },
          });
      }

      for (const invitation of org.invitations) {
        const tokenHash = hashToken(invitation.token);
        const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
        const [existing] = await tx
          .select({ id: organizationInvitations.id })
          .from(organizationInvitations)
          .where(eq(organizationInvitations.tokenHash, tokenHash))
          .limit(1);
        if (existing) {
          // Keep a still-open seeded invitation usable; accepted or revoked ones stay as they are.
          await tx
            .update(organizationInvitations)
            .set({ expiresAt })
            .where(
              and(
                eq(organizationInvitations.id, existing.id),
                isNull(organizationInvitations.acceptedAt),
                isNull(organizationInvitations.revokedAt),
              ),
            );
          continue;
        }
        const [inserted] = await tx
          .insert(organizationInvitations)
          .values({
            organizationId: organization.id,
            email: invitation.email,
            role: invitation.role,
            tokenHash,
            invitedByUserId: ownerId,
            expiresAt,
          })
          // Someone already has an open invitation for this email from the UI: keep theirs.
          .onConflictDoNothing()
          .returning({ id: organizationInvitations.id });
        if (inserted) {
          await audit.record(
            {
              action: 'organization.invitation_created',
              organizationId: organization.id,
              actorUserId: ownerId,
              resourceType: 'invitation',
              resourceId: inserted.id,
              metadata: { role: invitation.role, source: 'dev-seed' },
            },
            undefined,
            tx,
          );
        }
      }
    }

    // Platform-level record (no organization): the seed (re)grants Super Admin and roles.
    await audit.record(
      {
        action: 'platform.dev_seed_applied',
        actorUserId: superAdminId,
        resourceType: 'dev_seed',
        metadata: { users: DEV_USERS.length, organizations: DEV_ORGANIZATIONS.length },
      },
      undefined,
      tx,
    );

    return { userIds, organizationIds };
  });
}
