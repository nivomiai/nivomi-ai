import { organizationRoles } from '@nivomi/database';

export type OrganizationRole = (typeof organizationRoles)[number];

/**
 * Permission catalogue. Grows phase by phase (campaigns, calls…); every endpoint that touches
 * tenant data declares one.
 */
export type Permission =
  | 'organization.read'
  | 'members.read'
  | 'members.invite'
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
  | 'consent.manage'
  | 'agents.read'
  | 'agents.manage'
  | 'dashboard.read';

/** Everything a tenant can see or do on its own data. All multi-member roles get this set. */
const FULL_TENANT: readonly Permission[] = [
  'organization.read',
  'dashboard.read',
  'members.read',
  'audit.read',
  'leads.read',
  'leads.write',
  'imports.manage',
  'suppression.manage',
  'integrations.read',
  'integrations.manage',
  'integrations.sync',
  'agents.read',
  'agents.manage',
  'campaigns.read',
  'campaigns.manage',
  'campaigns.emergency_stop',
  'compliance.read',
  'compliance.review',
  'telecom.read',
  'telecom.manage',
  'consent.manage',
];

const MEMBERSHIP_MANAGEMENT: readonly Permission[] = ['members.invite', 'members.remove'];

/**
 * Role → permissions. Three account types; every member of an account shares the account's role.
 *
 * - INDV_USER: solo workspace from public signup. Full data access, but no multi-member admin.
 * - ORGANIZATION: multi-user team account. Full data access + membership management.
 * - CUSTOM_PLAN: multi-user enterprise/bespoke account. Same scope as ORGANIZATION.
 */
const ROLE_PERMISSIONS: Record<OrganizationRole, ReadonlySet<Permission>> = {
  INDV_USER: new Set<Permission>(FULL_TENANT),
  ORGANIZATION: new Set<Permission>([...FULL_TENANT, ...MEMBERSHIP_MANAGEMENT]),
  CUSTOM_PLAN: new Set<Permission>([...FULL_TENANT, ...MEMBERSHIP_MANAGEMENT]),
};

export function roleHasPermission(role: OrganizationRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

/** Solo-account roles cannot invite or hold multiple members. */
export function isMultiMemberRole(role: OrganizationRole): boolean {
  return role === 'ORGANIZATION' || role === 'CUSTOM_PLAN';
}

/**
 * Account types that only a platform Super Admin may provision. Public /signup creates
 * INDV_USER accounts; everything else goes through the /platform admin.
 */
export function isPlatformProvisionedRole(role: OrganizationRole): boolean {
  return role === 'ORGANIZATION' || role === 'CUSTOM_PLAN';
}

export function permissionsFor(role: OrganizationRole): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}

export interface RoleAccess {
  readonly role: OrganizationRole;
  readonly permissions: Permission[];
}

/** The whole matrix, in role order, so members can see what every role may do. */
export function roleMatrix(): RoleAccess[] {
  return organizationRoles.map((role) => ({
    role,
    permissions: permissionsFor(role),
  }));
}
