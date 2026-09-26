/** Response shapes of the Nivomi API (apps/api), kept in one place for the web app. */

export const ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'AGENT', 'ANALYST', 'VIEWER'] as const;
export type Role = (typeof ROLES)[number];

export type Permission =
  | 'organization.read'
  | 'members.read'
  | 'members.invite'
  | 'members.update_role'
  | 'members.remove'
  | 'audit.read';

export type OrganizationStatus = 'PENDING_APPROVAL' | 'ACTIVE' | 'SUSPENDED' | 'CLOSED';

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
  role: Role;
}

export interface Me {
  user: { id: string; email: string; name: string; emailVerified: boolean };
  activeOrganization: { id: string; role: Role; permissions: Permission[] } | null;
  organizations: OrganizationSummary[];
}

export interface Member {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: Role;
  joinedAt: string;
}

export interface Invitation {
  id: string;
  email: string;
  role: Role;
  createdAt: string;
  expiresAt: string;
}

export interface SessionInfo {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

export interface AuditItem {
  id: string;
  action: string;
  actorUserId: string | null;
  resourceType: string | null;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  requestId: string | null;
  createdAt: string;
}

export interface Page<T> {
  items: T[];
  nextCursor?: string | null;
}

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  AGENT: 'Agent',
  ANALYST: 'Analyst',
  VIEWER: 'Viewer',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  OWNER: 'Full control, including billing and owners.',
  ADMIN: 'Manages the team, settings and integrations.',
  MANAGER: 'Runs campaigns and reviews calls.',
  AGENT: 'Handles leads and callbacks assigned to them.',
  ANALYST: 'Reads reports and call outcomes.',
  VIEWER: 'Read-only access.',
};
