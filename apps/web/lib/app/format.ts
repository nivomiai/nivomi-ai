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
  'lead.created': 'Added a lead',
  'lead.updated': 'Edited a lead',
  'lead.status_changed': 'Changed a lead’s status',
  'suppression.added': 'Added a number to the suppression list',
  'suppression.removed': 'Removed a number from the suppression list',
  'ingestion.review_resolved': 'Resolved a possible duplicate',
  'import.created': 'Started a file import',
  'import.confirmed': 'Confirmed a file import',
  'import.cancelled': 'Cancelled a file import',
  'import.error_report_downloaded': 'Downloaded an import error report',
  'crm.connected': 'Connected HubSpot',
  'crm.connection_rejected': 'A HubSpot connection was refused',
  'crm.disconnected': 'Disconnected HubSpot',
  'crm.settings_updated': 'Changed HubSpot consent mapping',
  'crm.sync_requested': 'Started a HubSpot sync',
  'crm.token_invalid': 'HubSpot access expired',
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
