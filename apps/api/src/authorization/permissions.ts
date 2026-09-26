import type { organizationRoles } from '@nivomi/database';

export type OrganizationRole = (typeof organizationRoles)[number];

/**
 * Permission catalogue. Grows phase by phase (leads, campaigns, calls…); every endpoint that
 * touches tenant data declares one.
 */
export type Permission =
  | 'organization.read'
  | 'members.read'
  | 'members.invite'
  | 'members.update_role'
  | 'members.remove'
  | 'audit.read';

/** Role → permissions, from the PRD §8.1 permission matrix. Central; never checked ad hoc. */
const ROLE_PERMISSIONS: Record<OrganizationRole, ReadonlySet<Permission>> = {
  OWNER: new Set<Permission>([
    'organization.read',
    'members.read',
    'members.invite',
    'members.update_role',
    'members.remove',
    'audit.read',
  ]),
  ADMIN: new Set<Permission>([
    'organization.read',
    'members.read',
    'members.invite',
    'members.update_role',
    'members.remove',
    'audit.read',
  ]),
  MANAGER: new Set<Permission>(['organization.read', 'members.read']),
  AGENT: new Set<Permission>(['organization.read']),
  ANALYST: new Set<Permission>(['organization.read']),
  VIEWER: new Set<Permission>(['organization.read']),
};

export function roleHasPermission(role: OrganizationRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

/** Roles only an OWNER may grant (PRD FR-2). */
export function isPrivilegedRole(role: OrganizationRole): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}

export function permissionsFor(role: OrganizationRole): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}
