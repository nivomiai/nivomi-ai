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
  type: 'status' | 'field' | 'eligibility' | 'call';
  at: string;
  from?: string | null;
  to?: string | null;
  source: string;
  reason?: string | null;
  field?: string;
  /** eligibility */
  purpose?: 'PRE_LAUNCH' | 'DIAL';
  result?: EligibilityResult;
  reasons?: EligibilityReason[];
  ruleSetVersion?: number | null;
  campaignName?: string | null;
  /** call */
  attemptNumber?: number;
  outcome?: CallOutcome | null;
  durationSeconds?: number | null;
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

// ── Eligibility and ComplianceEngine (FR-44–FR-52, ADR-021) ────────────

export type EligibilityResult = 'ELIGIBLE' | 'BLOCKED' | 'DEFERRED' | 'REQUIRES_REVIEW';

export interface EligibilityReason {
  code: string;
  result: EligibilityResult;
  message: string;
}

export const ELIGIBILITY_LABELS: Record<EligibilityResult, string> = {
  ELIGIBLE: 'Eligible',
  BLOCKED: 'Blocked',
  DEFERRED: 'Deferred',
  REQUIRES_REVIEW: 'Needs review',
};

/** Short labels for reason codes; the API also sends a sentence per reason. */
export const REASON_LABELS: Record<string, string> = {
  ORGANIZATION_NOT_ACTIVE: 'Organization not approved',
  EMERGENCY_STOP_ACTIVE: 'Emergency Stop on',
  COMPLAINT_BREAKER_TRIPPED: 'Complaint breaker tripped',
  TELECOM_IDENTITY_NOT_VERIFIED: 'Telecom identity not verified',
  TELECOM_IDENTITY_EXPIRED: 'Self-certification expired',
  A2P_NOT_DECLARED: 'Automated calling not declared',
  NO_CALLER_NUMBER: 'No caller number',
  CALLER_NUMBER_NOT_ACTIVE: 'Caller number paused',
  UNKNOWN_NUMBER_SERIES: 'Caller number not in a commercial series',
  NUMBER_SERIES_NOT_PERMITTED: 'Wrong number series for this call type',
  NO_CONSENT_BASIS: 'No consent basis',
  CONSENT_REVOKED: 'Consent revoked',
  RECONSENT_BLOCK_ACTIVE: 'Re-consent blocked (90 days)',
  CONSENT_BASIS_NOT_PERMITTED: 'Consent basis not valid for this call type',
  CONSENT_OPERATOR_REFERENCE_MISSING: 'Operator consent reference missing',
  CONSENT_EXPIRED: 'Consent expired',
  CONSENT_EVIDENCE_INCOMPLETE: 'Consent date missing',
  NO_DPDP_CONSENT: 'No DPDP consent',
  DPDP_CONSENT_REVOKED: 'DPDP consent withdrawn',
  DND_REGISTERED: 'On the DND registry',
  PREFERENCE_CATEGORY_UNKNOWN: 'DND category unclear',
  PREFERENCE_REGISTRY_UNAVAILABLE: 'DND registry unavailable',
  NO_PHONE_NUMBER: 'No phone number',
  UNKNOWN_JURISDICTION: 'Country not covered by a rule set',
  MISSING_RULE: 'No rule for this case',
  SECTOR_RULES_UNCONFIRMED: 'Sector rules unconfirmed',
  OUTSIDE_CALLING_HOURS: 'Outside calling hours',
  SUPPRESSED: 'On the suppression list',
  LEAD_DO_NOT_CALL: 'Marked Do not call',
  LEAD_STATUS_EXCLUDED: 'Converted or closed',
  MAX_ATTEMPTS_REACHED: 'Attempt limit reached',
  CAMPAIGN_ENDED: 'Campaign ended',
  CAMPAIGN_NOT_STARTED: 'Campaign not started yet',
  COOLDOWN_ACTIVE: 'Waiting between attempts',
  DAILY_ATTEMPT_CAP: 'Daily attempt limit reached',
  CALL_IN_PROGRESS: 'Already on a call',
  ALREADY_CONNECTED_TODAY: 'Already spoke today',
  BUDGET_EXHAUSTED: 'Minute budget used up',
};

export function reasonLabel(code: string): string {
  return REASON_LABELS[code] ?? code;
}

export interface RuleSetSummary {
  id: string;
  jurisdiction: string;
  version: number;
  status: 'DRAFT' | 'APPROVED' | 'RETIRED';
  pendingLegalReview: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  reviewNote: string | null;
  sources: { id: string; title: string; reference: string }[];
  rules: {
    timezone: string;
    numberSeries: { id: string; prefix: string; description: string }[];
    callCategories: Partial<
      Record<
        CallCategory,
        { description: string; callingWindow: { start: string; end: string } | null }
      >
    >;
    consentBases: Partial<Record<ConsentBasis, { validityDays: number | null }>>;
    optOut: { reConsentBlockDays: number };
    complaints: { breakerThreshold: number; windowDays: number };
  };
}

export interface CallingControls {
  defaultJurisdiction: string;
  emergencyStop: { active: boolean; at: string | null; reason: string | null };
  breaker: {
    tripped: boolean;
    at: string | null;
    reason: string | null;
    acknowledgedAt: string | null;
    threshold: { breakerThreshold: number; windowDays: number } | null;
  };
}

export interface ComplaintRecord {
  id: string;
  kind: 'COMPLAINT' | 'OPERATOR_FLAG';
  callerNumberId: string | null;
  callerNumber: string | null;
  leadId: string | null;
  receivedAt: string;
  reference: string | null;
  note: string | null;
  createdAt: string;
}

export interface EligibilityReview {
  id: string;
  campaignId: string;
  campaignName: string;
  leadId: string;
  leadName: string;
  reasons: EligibilityReason[];
  createdAt: string;
}

// ── Telecom identity (FR-9–FR-13) ───────────────────────────────────────

export type TelecomIdentityStatus =
  'UNVERIFIED' | 'PENDING_REVIEW' | 'VERIFIED' | 'EXPIRED' | 'REVOKED';

export const BUSINESS_SECTORS = [
  'BFSI',
  'REAL_ESTATE',
  'EDUCATION',
  'HEALTH',
  'CONSUMER_GOODS_AUTOMOBILES',
  'COMMUNICATION_IT_ENTERTAINMENT',
  'TOURISM_LEISURE',
  'FOOD_BEVERAGES',
  'OTHER',
] as const;
export type BusinessSector = (typeof BUSINESS_SECTORS)[number];

export const SECTOR_LABELS: Record<BusinessSector, string> = {
  BFSI: 'Banking, financial services, insurance',
  REAL_ESTATE: 'Real estate',
  EDUCATION: 'Education',
  HEALTH: 'Health',
  CONSUMER_GOODS_AUTOMOBILES: 'Consumer goods and automobiles',
  COMMUNICATION_IT_ENTERTAINMENT: 'Communication, IT, entertainment',
  TOURISM_LEISURE: 'Tourism and leisure',
  FOOD_BEVERAGES: 'Food and beverages',
  OTHER: 'Other',
};

export interface CallerNumber {
  id: string;
  phone: string;
  series: string;
  purpose: 'PROMOTIONAL' | 'SERVICE';
  a2pDeclared: boolean;
  status: 'ACTIVE' | 'PAUSED' | 'RETIRED';
  statusReason: string | null;
  createdAt: string;
}

export interface TelecomIdentity {
  status: TelecomIdentityStatus;
  effectiveStatus: TelecomIdentityStatus;
  statusReason: string | null;
  legalName: string | null;
  dltEntityId: string | null;
  telemarketerName: string | null;
  telemarketerRegistrationId: string | null;
  sector: BusinessSector | null;
  a2pDeclarationReference: string | null;
  a2pDeclaredAt: string | null;
  selfCertifiedAt: string | null;
  selfCertificationExpiresAt: string | null;
  expiringSoon: boolean;
  submittedAt: string | null;
  reviewedAt: string | null;
  numbers: CallerNumber[];
  permittedSeries: { id: string; prefix: string; description: string }[];
}

// ── Consent ledgers (FR-52) ─────────────────────────────────────────────

export interface ConsentLedgers {
  telecom: {
    id: string;
    kind: 'GRANT' | 'REVOCATION';
    basis: ConsentBasis | null;
    validFrom: string | null;
    source: string;
    note: string | null;
    currentNumber: boolean;
    recipientInitiated: boolean;
    createdAt: string;
  }[];
  dpdp: {
    id: string;
    kind: 'GRANT' | 'REVOCATION';
    purpose: string;
    validFrom: string | null;
    source: string;
    note: string | null;
    createdAt: string;
  }[];
}

// ── Campaigns (FR-35–FR-43) ─────────────────────────────────────────────

export type CallCategory = 'PROMOTIONAL' | 'SERVICE' | 'TRANSACTIONAL';
export type CampaignStatus =
  'DRAFT' | 'SCHEDULED' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'CANCELLED' | 'STOPPED';
export type CampaignLeadState =
  'PENDING' | 'QUEUED' | 'IN_CALL' | 'WAITING' | 'BLOCKED' | 'REVIEW' | 'EXCLUDED' | 'DONE';
export type CallOutcome =
  | 'CONNECTED'
  | 'NO_ANSWER'
  | 'BUSY'
  | 'FAILED'
  | 'PROVIDER_ERROR'
  | 'OPTED_OUT'
  | 'NOT_INTERESTED'
  | 'WRONG_NUMBER';

export const CALL_CATEGORY_LABELS: Record<CallCategory, string> = {
  PROMOTIONAL: 'Promotional (sales)',
  SERVICE: 'Service',
  TRANSACTIONAL: 'Transactional',
};

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  DRAFT: 'Draft',
  SCHEDULED: 'Scheduled',
  RUNNING: 'Running',
  PAUSED: 'Paused',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  STOPPED: 'Stopped',
};

export const LEAD_STATE_LABELS: Record<CampaignLeadState, string> = {
  PENDING: 'Waiting to call',
  QUEUED: 'Queued',
  IN_CALL: 'On a call',
  WAITING: 'Waiting to retry',
  BLOCKED: 'Blocked',
  REVIEW: 'Needs review',
  EXCLUDED: 'Excluded',
  DONE: 'Done',
};

export const OUTCOME_LABELS: Record<CallOutcome, string> = {
  CONNECTED: 'Connected',
  NO_ANSWER: 'No answer',
  BUSY: 'Busy',
  FAILED: 'Failed',
  PROVIDER_ERROR: 'Provider error',
  OPTED_OUT: 'Opted out',
  NOT_INTERESTED: 'Not interested',
  WRONG_NUMBER: 'Wrong number',
};

export const PAUSE_REASON_LABELS: Record<string, string> = {
  MANUAL: 'Paused by a member',
  EMERGENCY_STOP: 'Emergency Stop',
  COMPLAINT_BREAKER: 'Complaint breaker tripped',
  BUDGET_EXHAUSTED: 'Minute budget used up',
  TELECOM_IDENTITY_INVALID: 'Telecom identity no longer valid',
  CALLER_NUMBER_UNAVAILABLE: 'Caller number paused or removed',
  ORGANIZATION_NOT_ACTIVE: 'Organization not active',
  NO_RULE_SET: 'No rule set for the jurisdiction',
  ENDED: 'End date reached',
};

export interface CampaignSelection {
  kind: 'FILTER' | 'LIST';
  statuses?: LeadStatus[];
  sources?: DataSource[];
  leadIds?: string[];
}

export interface CampaignListItem {
  id: string;
  name: string;
  status: CampaignStatus;
  type: 'STATIC' | 'CONTINUOUS';
  callCategory: CallCategory;
  pauseReason: string | null;
  budgetMinutes: number;
  usedSeconds: number;
  launchedAt: string | null;
  createdAt: string;
}

export interface PrelaunchCheck {
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  requestedAt: string;
  completedAt: string | null;
  total: number;
  eligible: number;
  deferred: number;
  blocked: number;
  review: number;
  byReason: Record<string, number>;
  ruleSetVersion: number | null;
  stale: boolean;
}

export interface Campaign extends CampaignListItem {
  callerNumber: { id: string; phone: string; series: string } | null;
  agentVersion: { id: string; agentId: string; agentName: string; version: number } | null;
  selection: CampaignSelection;
  windowStart: string;
  windowEnd: string;
  startsAt: string | null;
  endsAt: string | null;
  maxConcurrentCalls: number;
  maxCallsPerHour: number;
  maxAttempts: number;
  retryIntervalMinutes: number;
  maxAttemptsPerDay: number;
  prelaunch: PrelaunchCheck | null;
  completedAt: string | null;
  progress: {
    leadsByState: Partial<Record<CampaignLeadState, number>>;
    liveCalls: number;
    remaining: number;
    outcomes: Partial<Record<CallOutcome, number>>;
    reasons: { state: CampaignLeadState; code: string; count: number }[];
  };
}

export interface CallAttempt {
  id: string;
  leadId: string;
  leadName: string;
  attemptNumber: number;
  status: 'DIALING' | 'COMPLETED';
  outcome: CallOutcome | null;
  durationSeconds: number | null;
  createdAt: string;
  endedAt: string | null;
}

export interface CampaignLead {
  id: string;
  leadId: string;
  fullName: string;
  phone: string | null;
  state: CampaignLeadState;
  attemptsMade: number;
  nextAttemptAt: string | null;
  lastResult: EligibilityResult | null;
  lastReasons: string[];
  lastOutcome: CallOutcome | null;
  createdAt: string;
}

// ── AI Agents (FR-26–FR-32, ADR-022) ────────────────────────────────────

export const AGENT_LANGUAGES = ['en', 'hi', 'ml', 'ta', 'te', 'kn'] as const;
export type AgentLanguage = (typeof AGENT_LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<AgentLanguage, string> = {
  en: 'English',
  hi: 'Hindi',
  ml: 'Malayalam',
  ta: 'Tamil',
  te: 'Telugu',
  kn: 'Kannada',
};

export const ANSWER_TYPES = ['yes_no', 'single_choice', 'number', 'date', 'free_text'] as const;
export type AnswerType = (typeof ANSWER_TYPES)[number];
export const ANSWER_TYPE_LABELS: Record<AnswerType, string> = {
  yes_no: 'Yes / no',
  single_choice: 'One of several options',
  number: 'Number',
  date: 'Date',
  free_text: 'Free text',
};

export const END_OUTCOMES = [
  'INTERESTED',
  'NOT_INTERESTED',
  'CALLBACK_REQUESTED',
  'COMPLETED',
] as const;
export type EndOutcome = (typeof END_OUTCOMES)[number];
export const END_OUTCOME_LABELS: Record<EndOutcome, string> = {
  INTERESTED: 'Interested',
  NOT_INTERESTED: 'Not interested',
  CALLBACK_REQUESTED: 'Callback requested',
  COMPLETED: 'Completed',
};

export const EDGE_INTENTS = ['affirm', 'deny', 'not_interested', 'callback'] as const;
export type EdgeIntent = (typeof EDGE_INTENTS)[number];
export const INTENT_LABELS: Record<EdgeIntent, string> = {
  affirm: 'says yes',
  deny: 'says no',
  not_interested: 'is not interested',
  callback: 'asks for a callback',
};

export const COMPARE_OPS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in'] as const;
export type CompareOp = (typeof COMPARE_OPS)[number];
export const COMPARE_LABELS: Record<CompareOp, string> = {
  eq: 'is',
  neq: 'is not',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  in: 'is one of',
};

export type ConditionValue = string | number | boolean | string[];

export type EdgeCondition =
  | { type: 'always' }
  | { type: 'answer'; key: string; op: CompareOp; value: ConditionValue }
  | { type: 'intent'; intent: EdgeIntent };

interface NodeBase {
  id: string;
  position: { x: number; y: number };
}
export type WorkflowNode =
  | (NodeBase & { type: 'start'; data: { greeting: string } })
  | (NodeBase & {
      type: 'question';
      data: {
        key: string;
        prompt: string;
        answerType: AnswerType;
        options: string[];
        required: boolean;
      };
    })
  | (NodeBase & { type: 'agent'; data: { instructions: string; maxTurns: number } })
  | (NodeBase & { type: 'handoff'; data: { message: string } })
  | (NodeBase & { type: 'end'; data: { outcome: EndOutcome; message: string } });
export type WorkflowNodeType = WorkflowNode['type'];

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  condition: EdgeCondition;
}

export interface AgentDefinition {
  schemaVersion: 1;
  personaName: string;
  companyName: string;
  purpose: string;
  primaryLanguage: AgentLanguage;
  otherLanguages: AgentLanguage[];
  voice: string | null;
  callLimits: { maxCallSeconds: number; silenceTimeoutSeconds: number; maxReprompts: number };
  recordingEnabled: boolean;
  escalation: { humanRequest: true; afterRepromptsExhausted: boolean; target: string | null };
  knowledge: string;
  objectionGuidance: string;
  tools: string[];
  qualification: {
    mode: 'ALL' | 'ANY';
    rules: { key: string; op: CompareOp; value: ConditionValue }[];
  };
  workflow: { nodes: WorkflowNode[]; edges: WorkflowEdge[] };
}

export type AgentStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
export type AgentCallCategory = 'PROMOTIONAL' | 'SERVICE';

export interface AgentSummary {
  id: string;
  name: string;
  status: AgentStatus;
  callCategory: AgentCallCategory;
  latestVersion: number;
  latestVersionId: string | null;
  personaName: string | null;
  primaryLanguage: AgentLanguage | null;
  otherLanguages: AgentLanguage[];
  tools: string[];
  updatedAt: string;
}

export interface AgentDetail {
  id: string;
  name: string;
  status: AgentStatus;
  callCategory: AgentCallCategory;
  latestVersion: number;
  definition: AgentDefinition;
  problems: string[];
  unpublishedChanges: boolean;
  versions: { id: string; version: number; createdAt: string; publishedBy: string | null }[];
  updatedAt: string;
}

export interface AgentTool {
  name: string;
  label: string;
  description: string;
  sideEffect: string;
  audited: boolean;
}

export type ConversationOutcome = EndOutcome | 'OPTED_OUT' | 'TRANSFERRED' | 'INCOMPLETE';

export interface TestSession {
  id: string;
  agentId: string;
  versionId: string | null;
  turn: number;
  transcript: { role: 'agent' | 'caller'; text: string; nodeId?: string; at: string }[];
  currentStep: string;
  answers: Record<string, string | number | boolean | null>;
  ended: boolean;
  outcome: ConversationOutcome | null;
  qualification: 'QUALIFIED' | 'NOT_QUALIFIED' | 'INCOMPLETE';
  expiresAt: string;
}

// ── Dashboard and call queue ─────────────────────────────────────────────

export interface DashboardSummary {
  timezone: string;
  since: string;
  today: {
    dialled: number;
    completed: number;
    answered: number;
    connected: number;
    answerRate: number | null;
  };
  funnel: { stage: string; count: number }[];
  leads: { total: number; qualified: number; appointments: number; doNotCall: number };
  attention: {
    code: string;
    label: string;
    count: number | null;
    href: string;
    severity: 'critical' | 'warning';
  }[];
  campaigns: {
    id: string;
    name: string;
    status: CampaignStatus;
    pauseReason: string | null;
    budgetMinutes: number;
    usedSeconds: number;
    leads: number;
    settled: number;
    calls: number;
  }[];
}

export interface CallQueueItem {
  id: string;
  state: CampaignLeadState;
  attemptsMade: number;
  nextAttemptAt: string | null;
  lastResult: EligibilityResult | null;
  lastReasons: string[];
  lastOutcome: CallOutcome | null;
  campaignId: string;
  campaignName: string;
  campaignStatus: CampaignStatus;
  leadId: string;
  leadStatus: LeadStatus;
  fullName: string;
  phone: string | null;
}
