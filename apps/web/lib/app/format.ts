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
};

export function describeAuditAction(action: string): string {
  return AUDIT_LABELS[action] ?? action;
}
