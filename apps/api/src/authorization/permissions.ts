import type { organizationRoles } from '@nivomi/database';

export type OrganizationRole = (typeof organizationRoles)[number];

/**
 * Permission catalogue. Grows phase by phase (campaigns, calls…); every endpoint that touches
 * tenant data declares one.
 */
export type Permission =
  | 'organization.read'
  | 'members.read'
  | 'members.invite'
  | 'members.update_role'
  | 'members.remove'
  | 'audit.read'
  | 'leads.read'
  | 'leads.write'
  | 'imports.manage'
  | 'suppression.manage'
  | 'integrations.read'
  | 'integrations.manage'
  | 'integrations.sync'
  | 'campaigns.read'
  | 'campaigns.manage'
  | 'campaigns.emergency_stop'
  | 'compliance.read'
  | 'compliance.review'
  | 'telecom.read'
  | 'telecom.manage'
  | 'consent.manage';

const ADMINISTRATION: readonly Permission[] = [
  'organization.read',
  'members.read',
  'members.invite',
  'members.update_role',
  'members.remove',
  'audit.read',
];

const DATA_MANAGEMENT: readonly Permission[] = [
  'leads.read',
  'leads.write',
  'imports.manage',
  'suppression.manage',
  'integrations.read',
  'integrations.sync',
];

/** Campaigns: create, start, pause; Emergency Stop (PRD §8.1). */
const CAMPAIGNS: readonly Permission[] = [
  'campaigns.read',
  'campaigns.manage',
  'campaigns.emergency_stop',
  'compliance.read',
  'consent.manage',
];

/** Telecom Identity ✓; resolve REQUIRES_REVIEW and Complaint Records ✓ (OWNER, ADMIN only). */
const COMPLIANCE_ADMINISTRATION: readonly Permission[] = [
  'telecom.read',
  'telecom.manage',
  'compliance.review',
];

/** Role → permissions, from the PRD §8.1 permission matrix. Central; never checked ad hoc. */
const ROLE_PERMISSIONS: Record<OrganizationRole, ReadonlySet<Permission>> = {
  OWNER: new Set<Permission>([
    ...ADMINISTRATION,
    ...DATA_MANAGEMENT,
    'integrations.manage',
    ...CAMPAIGNS,
    ...COMPLIANCE_ADMINISTRATION,
  ]),
  ADMIN: new Set<Permission>([
    ...ADMINISTRATION,
    ...DATA_MANAGEMENT,
    'integrations.manage',
    ...CAMPAIGNS,
    ...COMPLIANCE_ADMINISTRATION,
  ]),
  // Leads: import, edit, Suppression List ✓; HubSpot R (plus running an ingest, FR-19).
  // Campaigns ✓ and Emergency Stop ✓; Telecom Identity R; no review queue or complaints.
  MANAGER: new Set<Permission>([
    'organization.read',
    'members.read',
    ...DATA_MANAGEMENT,
    ...CAMPAIGNS,
    'telecom.read',
  ]),
  // Leads: own records only. No campaigns.
  AGENT: new Set<Permission>(['organization.read', 'leads.read', 'leads.write']),
  // Leads and campaigns: read-only.
  ANALYST: new Set<Permission>([
    'organization.read',
    'leads.read',
    'campaigns.read',
    'compliance.read',
  ]),
  VIEWER: new Set<Permission>(['organization.read']),
};

/** Permissions a role holds only for records assigned to the Member ("own" in the matrix). */
const OWN_SCOPED: Partial<Record<OrganizationRole, ReadonlySet<Permission>>> = {
  AGENT: new Set<Permission>(['leads.read', 'leads.write']),
};

export function roleHasPermission(role: OrganizationRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

/** True when `role` may use `permission` only on records assigned to the Member. */
export function isOwnScoped(role: OrganizationRole, permission: Permission): boolean {
  return OWN_SCOPED[role]?.has(permission) ?? false;
}

/** Roles only an OWNER may grant (PRD FR-2). */
export function isPrivilegedRole(role: OrganizationRole): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}

export function permissionsFor(role: OrganizationRole): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}
