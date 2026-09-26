/** Response shapes of the Nivomi API (apps/api), kept in one place for the web app. */

export const ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'AGENT', 'ANALYST', 'VIEWER'] as const;
export type Role = (typeof ROLES)[number];

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
  | 'integrations.sync';

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

// ── Leads (PRD §8.3–8.4) ────────────────────────────────────────────────

export const LEAD_STATUSES = [
  'NEW',
  'CONTACTED',
  'ATTEMPTED',
  'CONNECTED',
  'INTERESTED',
  'QUALIFIED',
  'CALLBACK_REQUESTED',
  'FOLLOW_UP',
  'APPOINTMENT_BOOKED',
  'CONVERTED',
  'NOT_INTERESTED',
  'UNREACHABLE',
  'DO_NOT_CALL',
  'CLOSED',
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const CONSENT_BASES = [
  'INQUIRY',
  'APPLICATION',
  'REGISTERED_CONSENT',
  'EXISTING_CUSTOMER',
] as const;
export type ConsentBasis = (typeof CONSENT_BASES)[number];

export type DataSource = 'FILE_IMPORT' | 'HUBSPOT' | 'MANUAL' | 'INBOUND';

export interface LeadListItem {
  id: string;
  status: LeadStatus;
  source: DataSource;
  consentBasis: ConsentBasis | null;
  ownerUserId: string | null;
  createdAt: string;
  contactId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  suppressed: boolean;
}

export interface LeadTimelineEntry {
  type: 'status' | 'field';
  at: string;
  from: string | null;
  to: string | null;
  source: string;
  reason?: string | null;
  field?: string;
}

export interface LeadDetail {
  id: string;
  status: LeadStatus;
  source: DataSource;
  score: string | null;
  consentBasis: ConsentBasis | null;
  consentEvidence: {
    at: string | null;
    source: string | null;
    reference: string | null;
    operatorConsentReference: string | null;
    attestedByUserId: string | null;
  } | null;
  crmDetails: Record<string, string> | null;
  owner: { id: string; name: string } | null;
  suppressed: { source: string; createdAt: string } | null;
  createdAt: string;
  contact: {
    id: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    company: string | null;
    jobTitle: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    preferredLanguage: string | null;
    customFields: Record<string, string>;
  };
  sources: {
    provider: string;
    objectType: string;
    externalId: string;
    lastSyncedAt: string | null;
    connectionStatus: string | null;
  }[];
  timeline: LeadTimelineEntry[];
}

export interface SuppressionEntry {
  id: string;
  phone: string;
  source: 'MANUAL' | 'IMPORT' | 'IN_CALL_OPT_OUT' | 'HUBSPOT';
  reason: string | null;
  createdAt: string;
}

export interface ReviewItem {
  id: string;
  source: DataSource;
  reason: string;
  createdAt: string;
  record: { fullName?: string; phoneE164?: string; emailNormalized?: string | null };
  candidates: { id: string; fullName: string; email: string | null; phone: string | null }[];
}

// ── Imports (FR-14, FR-125–FR-127) ─────────────────────────────────────

export type ImportStatus =
  | 'AWAITING_UPLOAD'
  | 'ANALYZING'
  | 'MAPPING_REQUIRED'
  | 'PREVIEWING'
  | 'READY'
  | 'QUEUED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export interface ImportPreview {
  total: number;
  valid: number;
  invalid: number;
  missingRequired: number;
  matchesExisting: number;
  duplicatesInFile: number;
  noConsentBasis: number;
  suppressed: number;
  sampleErrors: { row: number; reason: string }[];
}

export interface ImportJob {
  id: string;
  fileName: string;
  fileType: 'csv' | 'xlsx';
  fileSize: number;
  status: ImportStatus;
  headers: string[] | null;
  suggestedMapping: Record<string, string> | null;
  mapping: Record<string, string> | null;
  preview: ImportPreview | null;
  error: string | null;
  counts: {
    total: number;
    processed: number;
    succeeded: number;
    failed: number;
    duplicates: number;
    review: number;
  };
  createdAt: string;
  completedAt: string | null;
  purgedAt: string | null;
  sampleRows?: { rowNumber: number; cells: string[] }[];
}

export interface ImportField {
  key: string;
  label: string;
  required: boolean;
}

// ── CRM (FR-84–FR-86, FR-131) ───────────────────────────────────────────

export type CrmConnectionStatus = 'CONNECTED' | 'DEGRADED' | 'TOKEN_INVALID' | 'DISCONNECTED';

export interface CrmSyncRun {
  id: string;
  trigger: 'INITIAL' | 'MANUAL' | 'SCHEDULED';
  mode: 'FULL' | 'INCREMENTAL';
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  counts: {
    fetched: number;
    created: number;
    updated: number;
    skipped: number;
    review: number;
    failed: number;
  };
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface CrmStatus {
  provider: string;
  available: boolean;
  connection: {
    status: CrmConnectionStatus;
    accountId: string;
    scopes: string[];
    leadsEnabled: boolean;
    settings: { consentProperty?: string | null; consentValueMap?: Record<string, string> };
    connectedAt: string | null;
    disconnectedAt: string | null;
    lastSyncAt: string | null;
    lastError: string | null;
  } | null;
  runs: CrmSyncRun[];
}

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  ATTEMPTED: 'Attempted',
  CONNECTED: 'Connected',
  INTERESTED: 'Interested',
  QUALIFIED: 'Qualified',
  CALLBACK_REQUESTED: 'Callback requested',
  FOLLOW_UP: 'Follow-up',
  APPOINTMENT_BOOKED: 'Appointment booked',
  CONVERTED: 'Converted',
  NOT_INTERESTED: 'Not interested',
  UNREACHABLE: 'Unreachable',
  DO_NOT_CALL: 'Do not call',
  CLOSED: 'Closed',
};

export const CONSENT_LABELS: Record<ConsentBasis, string> = {
  INQUIRY: 'Inquiry',
  APPLICATION: 'Application',
  REGISTERED_CONSENT: 'Registered consent',
  EXISTING_CUSTOMER: 'Existing customer',
};

export const SOURCE_LABELS: Record<DataSource, string> = {
  FILE_IMPORT: 'File import',
  HUBSPOT: 'HubSpot',
  MANUAL: 'Manual',
  INBOUND: 'Inbound call',
};
