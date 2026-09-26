import type { organizationRoles, organizationStatus } from '@nivomi/database';

/**
 * Local development dataset: organizations in every approval state, a member for every tenant
 * role, multi-organization users, open invitations and edge-case accounts. Fixed, well-known
 * credentials — never seed a shared or production database.
 */

/** Password for every seeded account. */
export const DEV_PASSWORD = 'nivomi-dev-admin';

type Role = (typeof organizationRoles)[number];
type Status = (typeof organizationStatus.enumValues)[number];

export interface DevUser {
  readonly email: string;
  readonly name: string;
  readonly verified: boolean;
  /** Platform operator; granted only here and in the database, never through a tenant role. */
  readonly superAdmin: boolean;
  /** What this account is for when testing by hand. */
  readonly scenario: string;
}

export interface DevOrganization {
  readonly name: string;
  readonly slug: string;
  readonly status: Status;
  /** The first OWNER is recorded as the creator. */
  readonly members: readonly { readonly email: string; readonly role: Role }[];
  /** `token` is the raw invitation token: open `/invite?token=<token>` signed in as `email`. */
  readonly invitations: readonly {
    readonly email: string;
    readonly role: Role;
    readonly token: string;
  }[];
}

export const DEV_USERS: readonly DevUser[] = [
  {
    email: 'admin@example.com',
    name: 'Nivomi Admin',
    verified: true,
    superAdmin: true,
    scenario: 'Platform Super Admin; OWNER of Nivomi Demo',
  },
  {
    email: 'ananya.admin@example.com',
    name: 'Ananya Iyer',
    verified: true,
    superAdmin: false,
    scenario: 'ADMIN: manages members and invitations',
  },
  {
    email: 'rahul.manager@example.com',
    name: 'Rahul Menon',
    verified: true,
    superAdmin: false,
    scenario: 'MANAGER: can view the team, cannot change it',
  },
  {
    email: 'priya.agent@example.com',
    name: 'Priya Nair',
    verified: true,
    superAdmin: false,
    scenario: 'Two organizations with different roles (org switching)',
  },
  {
    email: 'arjun.analyst@example.com',
    name: 'Arjun Reddy',
    verified: true,
    superAdmin: false,
    scenario: 'ANALYST: overview only until reporting ships',
  },
  {
    email: 'kavya.viewer@example.com',
    name: 'Kavya Rao',
    verified: true,
    superAdmin: false,
    scenario: 'VIEWER: least-privileged role',
  },
  {
    email: 'vikram.owner@example.com',
    name: 'Vikram Shah',
    verified: true,
    superAdmin: false,
    scenario: 'OWNER of a second tenant (cross-tenant isolation)',
  },
  {
    email: 'sneha.agent@example.com',
    name: 'Sneha Pillai',
    verified: true,
    superAdmin: false,
    scenario: 'Member of an approved and a pending organization',
  },
  {
    email: 'meera.owner@example.com',
    name: 'Meera Krishnan',
    verified: true,
    superAdmin: false,
    scenario: 'OWNER of a pending and a suspended organization',
  },
  {
    email: 'rohan.new@example.com',
    name: 'Rohan Das',
    verified: true,
    superAdmin: false,
    scenario: 'No organization yet; has an open invitation to Lotus Realty',
  },
  {
    email: 'deepak.unverified@example.com',
    name: 'Deepak Kumar',
    verified: false,
    superAdmin: false,
    scenario: 'Email not verified; no organization',
  },
];

export const DEV_ORGANIZATIONS: readonly DevOrganization[] = [
  {
    name: 'Nivomi Demo',
    slug: 'nivomi-demo',
    status: 'ACTIVE',
    members: [
      { email: 'admin@example.com', role: 'OWNER' },
      { email: 'ananya.admin@example.com', role: 'ADMIN' },
      { email: 'rahul.manager@example.com', role: 'MANAGER' },
      { email: 'priya.agent@example.com', role: 'AGENT' },
      { email: 'arjun.analyst@example.com', role: 'ANALYST' },
      { email: 'kavya.viewer@example.com', role: 'VIEWER' },
    ],
    invitations: [
      {
        email: 'lakshmi.invitee@example.com',
        role: 'AGENT',
        token: 'dev-invite-nivomi-demo-lakshmi',
      },
    ],
  },
  {
    name: 'Lotus Realty',
    slug: 'lotus-realty',
    status: 'ACTIVE',
    members: [
      { email: 'vikram.owner@example.com', role: 'OWNER' },
      { email: 'priya.agent@example.com', role: 'MANAGER' },
      { email: 'sneha.agent@example.com', role: 'AGENT' },
    ],
    invitations: [
      { email: 'rohan.new@example.com', role: 'AGENT', token: 'dev-invite-lotus-realty-rohan' },
    ],
  },
  {
    name: 'Coastal Homes',
    slug: 'coastal-homes',
    status: 'PENDING_APPROVAL',
    members: [
      { email: 'meera.owner@example.com', role: 'OWNER' },
      { email: 'sneha.agent@example.com', role: 'VIEWER' },
    ],
    invitations: [],
  },
  {
    name: 'Kerala Motors',
    slug: 'kerala-motors',
    status: 'SUSPENDED',
    members: [{ email: 'meera.owner@example.com', role: 'OWNER' }],
    invitations: [],
  },
];
