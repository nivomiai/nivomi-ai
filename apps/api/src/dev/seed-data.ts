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

export interface DevLead {
  readonly fullName: string;
  /** Fictitious Indian mobile numbers; never real people. */
  readonly phone: string;
  readonly email?: string;
  readonly company?: string;
  readonly city?: string;
  readonly status: string;
  /** A Consent Basis, `DND` for an opt-out, or omitted for "no basis, not callable". */
  readonly consent?: string;
  readonly consentSource?: string;
  /** Operator consent reference, required for REGISTERED_CONSENT. */
  readonly consentReference?: string;
  readonly source: 'MANUAL' | 'FILE_IMPORT';
  /** Assigned Human Agent; AGENTs see only their own leads. */
  readonly ownerEmail?: string;
}

/** Leads per organization slug, covering every consent state and several statuses. */
export const DEV_LEADS: Readonly<Record<string, readonly DevLead[]>> = {
  'nivomi-demo': [
    {
      fullName: 'Aarav Sharma',
      phone: '9847000101',
      email: 'aarav.sharma@example.com',
      company: 'Sharma Traders',
      city: 'Kochi',
      status: 'NEW',
      consent: 'INQUIRY',
      consentSource: 'Website enquiry form',
      source: 'FILE_IMPORT',
    },
    {
      fullName: 'Diya Nair',
      phone: '9847000102',
      email: 'diya.nair@example.com',
      city: 'Kozhikode',
      status: 'CONTACTED',
      consent: 'INQUIRY',
      consentSource: 'Website enquiry form',
      source: 'FILE_IMPORT',
      ownerEmail: 'priya.agent@example.com',
    },
    {
      fullName: 'Kabir Singh',
      phone: '9847000103',
      company: 'Singh Motors',
      city: 'Bengaluru',
      status: 'INTERESTED',
      consent: 'APPLICATION',
      consentSource: 'Loan application',
      source: 'MANUAL',
      ownerEmail: 'priya.agent@example.com',
    },
    {
      fullName: 'Meenakshi Pillai',
      phone: '9847000104',
      email: 'meenakshi.p@example.com',
      city: 'Thiruvananthapuram',
      status: 'QUALIFIED',
      consent: 'EXISTING_CUSTOMER',
      consentSource: 'Existing customer list',
      source: 'FILE_IMPORT',
    },
    {
      fullName: 'Rohit Verma',
      phone: '9847000105',
      city: 'Pune',
      status: 'CALLBACK_REQUESTED',
      consent: 'INQUIRY',
      consentSource: 'Property portal',
      source: 'FILE_IMPORT',
      ownerEmail: 'priya.agent@example.com',
    },
    {
      fullName: 'Sana Qureshi',
      phone: '9847000106',
      email: 'sana.q@example.com',
      company: 'Qureshi Interiors',
      city: 'Hyderabad',
      status: 'APPOINTMENT_BOOKED',
      consent: 'INQUIRY',
      consentSource: 'Website enquiry form',
      source: 'MANUAL',
    },
    {
      fullName: 'Vivek Reddy',
      phone: '9847000107',
      city: 'Chennai',
      status: 'NOT_INTERESTED',
      consent: 'INQUIRY',
      consentSource: 'Property portal',
      source: 'FILE_IMPORT',
    },
    {
      fullName: 'Anjali Menon',
      phone: '9847000108',
      email: 'anjali.menon@example.com',
      city: 'Kochi',
      status: 'NEW',
      source: 'FILE_IMPORT',
    },
    {
      fullName: 'Farhan Ali',
      phone: '9847000109',
      city: 'Mangaluru',
      status: 'NEW',
      source: 'FILE_IMPORT',
    },
    {
      fullName: 'Lakshmi Iyer',
      phone: '9847000110',
      email: 'lakshmi.i@example.com',
      city: 'Chennai',
      status: 'DO_NOT_CALL',
      consent: 'DND',
      source: 'FILE_IMPORT',
    },
    {
      fullName: 'Nikhil Joshi',
      phone: '9847000111',
      company: 'Joshi Builders',
      city: 'Mumbai',
      status: 'CONVERTED',
      consent: 'EXISTING_CUSTOMER',
      consentSource: 'Existing customer list',
      source: 'MANUAL',
    },
    {
      fullName: 'Pooja Das',
      phone: '9847000112',
      email: 'pooja.das@example.com',
      city: 'Kolkata',
      status: 'FOLLOW_UP',
      consent: 'INQUIRY',
      consentSource: 'Walk-in enquiry',
      source: 'MANUAL',
      ownerEmail: 'priya.agent@example.com',
    },
    // Calling demo (Phase 3): each shows one eligibility outcome in the demo campaign.
    {
      fullName: 'Ritu Kapoor',
      phone: '9847000115',
      email: 'ritu.kapoor@example.com',
      city: 'Delhi',
      status: 'NEW',
      consent: 'REGISTERED_CONSENT',
      consentReference: 'DCA-DEMO-0115',
      consentSource: 'Operator consent (DCA)',
      source: 'MANUAL',
    },
    {
      fullName: 'Arun Pillai',
      phone: '9847000116',
      city: 'Kochi',
      status: 'NEW',
      consent: 'EXISTING_CUSTOMER',
      consentSource: 'Existing customer list',
      source: 'FILE_IMPORT',
    },
    {
      // On the simulated preference registry as BLOCK PROMO.
      fullName: 'Neha Gupta',
      phone: '9847000113',
      city: 'Jaipur',
      status: 'NEW',
      consent: 'EXISTING_CUSTOMER',
      consentSource: 'Existing customer list',
      source: 'FILE_IMPORT',
    },
    {
      // On the simulated preference registry, blocking the real-estate category.
      fullName: 'Suresh Kumar',
      phone: '9847000114',
      city: 'Chennai',
      status: 'NEW',
      consent: 'EXISTING_CUSTOMER',
      consentSource: 'Existing customer list',
      source: 'FILE_IMPORT',
    },
  ],
  'lotus-realty': [
    {
      fullName: 'Arjun Krishnan',
      phone: '9847000201',
      email: 'arjun.k@example.com',
      city: 'Kochi',
      status: 'NEW',
      consent: 'INQUIRY',
      consentSource: 'Site visit register',
      source: 'FILE_IMPORT',
      ownerEmail: 'sneha.agent@example.com',
    },
    {
      fullName: 'Bhavana Rao',
      phone: '9847000202',
      city: 'Thrissur',
      status: 'ATTEMPTED',
      consent: 'INQUIRY',
      consentSource: 'Property portal',
      source: 'FILE_IMPORT',
      ownerEmail: 'sneha.agent@example.com',
    },
    {
      fullName: 'Charles Mathew',
      phone: '9847000203',
      email: 'charles.m@example.com',
      company: 'Mathew and Sons',
      city: 'Kottayam',
      status: 'INTERESTED',
      consent: 'INQUIRY',
      consentSource: 'Website enquiry form',
      source: 'MANUAL',
    },
    {
      fullName: 'Divya Suresh',
      phone: '9847000204',
      city: 'Palakkad',
      status: 'UNREACHABLE',
      consent: 'INQUIRY',
      consentSource: 'Property portal',
      source: 'FILE_IMPORT',
    },
    {
      fullName: 'Ebin Thomas',
      phone: '9847000205',
      city: 'Kochi',
      status: 'NEW',
      source: 'FILE_IMPORT',
    },
    {
      fullName: 'Fathima Beevi',
      phone: '9847000206',
      email: 'fathima.b@example.com',
      city: 'Kozhikode',
      status: 'QUALIFIED',
      consent: 'APPLICATION',
      consentSource: 'Home loan application',
      source: 'MANUAL',
      ownerEmail: 'sneha.agent@example.com',
    },
  ],
};

export interface DevCalling {
  /** Telecom Identity recorded as VERIFIED by the seed (stands in for Super Admin review). */
  readonly telecom: {
    readonly legalName: string;
    readonly dltEntityId: string;
    readonly telemarketerName: string;
    readonly telemarketerRegistrationId: string;
    readonly sector: 'REAL_ESTATE';
    readonly a2pDeclarationReference: string;
  };
  /** A fictitious 140-series number; the dialer is simulated. */
  readonly callerNumber: string;
  /** A published AI Agent (version 1) the demo campaign is pinned to. */
  readonly agent: { readonly name: string; readonly personaName: string; readonly purpose: string };
  /** A DRAFT campaign over every lead, ready for its pre-launch check. */
  readonly campaign: {
    readonly name: string;
    readonly windowStart: string;
    readonly windowEnd: string;
    readonly budgetMinutes: number;
  };
}

/**
 * Calling demo per organization slug. Lotus Realty has none on purpose: its campaigns show the
 * "telecom identity not verified" block.
 */
export const DEV_CALLING: Readonly<Record<string, DevCalling>> = {
  'nivomi-demo': {
    telecom: {
      legalName: 'Nivomi Demo Private Limited',
      dltEntityId: 'DEMO-DLT-1101',
      telemarketerName: 'Demo Telemarketer (simulated)',
      telemarketerRegistrationId: 'DEMO-TM-01',
      sector: 'REAL_ESTATE',
      a2pDeclarationReference: 'DEMO-A2P-01',
    },
    callerNumber: '+911400000001',
    agent: {
      name: 'Site-visit assistant (demo)',
      personaName: 'Maya',
      purpose: 'your recent property enquiry',
    },
    campaign: {
      name: 'Site-visit follow-up (demo)',
      windowStart: '10:00',
      windowEnd: '19:00',
      budgetMinutes: 60,
    },
  },
};
