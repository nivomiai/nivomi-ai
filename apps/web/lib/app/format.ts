const dateTime = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : dateTime.format(date);
}

const shortDate = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Table-friendly age: "Just now", "5 minutes ago", "2 hours ago", "Yesterday", "16 Oct". */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const ago = now.getTime() - date.getTime();
  if (ago < MINUTE) return 'Just now';
  if (ago < HOUR) {
    const minutes = Math.floor(ago / MINUTE);
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (date.getTime() >= startOfToday) {
    const hours = Math.floor(ago / HOUR);
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  if (date.getTime() >= startOfToday - 24 * HOUR) return 'Yesterday';
  return shortDate.format(date);
}

/** A short, human label for a browser user-agent string (no fingerprinting detail). */
export function describeDevice(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device';
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Chrome\//.test(userAgent)
      ? 'Chrome'
      : /Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : 'Browser';
  const os = /Windows/.test(userAgent)
    ? 'Windows'
    : /Android/.test(userAgent)
      ? 'Android'
      : /iPhone|iPad/.test(userAgent)
        ? 'iOS'
        : /Mac OS X/.test(userAgent)
          ? 'macOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : null;
  return os ? `${browser} on ${os}` : browser;
}

/** Audit action ids → readable sentences. Unknown actions fall back to the id. */
const AUDIT_LABELS: Record<string, string> = {
  'organization.created': 'Created the organization',
  'organization.switched': 'Switched into the organization',
  'organization.member_role_changed': 'Changed a member’s role',
  'organization.member_removed': 'Removed a member',
  'organization.invitation_created': 'Invited a member',
  'organization.invitation_revoked': 'Revoked an invitation',
  'organization.invitation_accepted': 'Accepted an invitation',
  'platform.dev_seed_applied': 'Seeded the development data',
  'platform.organization_approved': 'Approved an organization',
  'platform.organization_suspended': 'Suspended an organization',
  'platform.organization_reactivated': 'Reactivated an organization',
  'platform.organization_closed': 'Closed an organization',
  'lead.created': 'Added a lead',
  'lead.updated': 'Edited a lead',
  'lead.status_changed': 'Changed a lead’s status',
  'lead.export_requested': 'Requested a leads export',
  'lead.export_downloaded': 'Downloaded a leads export',
  'suppression.added': 'Added a number to the suppression list',
  'suppression.removed': 'Removed a number from the suppression list',
  'ingestion.review_resolved': 'Resolved a possible duplicate',
  'import.created': 'Started a file import',
  'import.confirmed': 'Confirmed a file import',
  'import.cancelled': 'Cancelled a file import',
  'import.error_report_downloaded': 'Downloaded an import error report',
  'crm.connected': 'Connected an external CRM',
  'crm.connection_rejected': 'An external CRM connection was refused',
  'crm.disconnected': 'Disconnected an external CRM',
  'crm.settings_updated': 'Changed external CRM consent mapping',
  'crm.sync_requested': 'Started an external CRM sync',
  'crm.token_invalid': 'External CRM access expired',
  'campaign.created': 'Created a campaign',
  'campaign.updated': 'Edited a campaign',
  'campaign.prelaunch_requested': 'Ran a campaign’s pre-launch check',
  'campaign.launched': 'Launched a campaign',
  'campaign.paused': 'Paused a campaign',
  'campaign.auto_paused': 'A campaign was paused automatically',
  'campaign.resumed': 'Resumed a campaign',
  'campaign.stopped': 'Stopped a campaign',
  'campaign.cancelled': 'Cancelled a campaign',
  'campaign.completed': 'A campaign completed',
  'calling.emergency_stop_activated': 'Turned on Emergency Stop',
  'calling.emergency_stop_released': 'Released Emergency Stop',
  'telecom.identity_updated': 'Changed the telecom identity',
  'telecom.identity_submitted': 'Submitted the telecom identity for verification',
  'telecom.identity_verified': 'The telecom identity was verified',
  'telecom.identity_rejected': 'The telecom identity was sent back',
  'telecom.number_added': 'Added a caller number',
  'telecom.number_removed': 'Removed a caller number',
  'consent.recorded': 'Recorded a consent change',
  'compliance.complaint_recorded': 'Recorded a complaint',
  'compliance.breaker_tripped': 'The complaint breaker paused calling',
  'compliance.breaker_acknowledged': 'Acknowledged the complaint breaker',
  'compliance.breaker_cleared': 'The complaint breaker was cleared',
  'compliance.review_resolved': 'Resolved an eligibility review',
};

export function describeAuditAction(action: string): string {
  return AUDIT_LABELS[action] ?? action;
}

const integer = new Intl.NumberFormat('en-IN');

export function formatNumber(value: number): string {
  return integer.format(value);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "+919876543210" → "+91 98765 43210" for Indian mobiles; other numbers unchanged. */
export function formatPhone(e164: string | null): string {
  if (!e164) return '—';
  const indian = /^\+91(\d{5})(\d{5})$/.exec(e164);
  return indian ? `+91 ${indian[1]} ${indian[2]}` : e164;
}

/** Saves a Blob as a file download in the browser. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
