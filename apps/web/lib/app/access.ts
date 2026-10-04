import type { Permission } from '../api/types';

/** Groups on the Roles & access screen, in display order. */
export const ACCESS_AREAS = [
  'Organization & team',
  'Leads & data',
  'Integrations',
  'Campaigns & compliance',
] as const;

export type AccessArea = (typeof ACCESS_AREAS)[number];

/**
 * Plain-language label for every permission. Keyed by the full `Permission` union, so a new
 * permission from the API cannot ship without a label here.
 */
export const PERMISSION_LABELS: Record<Permission, { area: AccessArea; label: string }> = {
  'organization.read': { area: 'Organization & team', label: 'Open the workspace' },
  'members.read': { area: 'Organization & team', label: 'See the team' },
  'members.invite': { area: 'Organization & team', label: 'Invite members' },
  'members.remove': { area: 'Organization & team', label: 'Remove members' },
  'audit.read': { area: 'Organization & team', label: 'Read the audit log' },
  'leads.read': { area: 'Leads & data', label: 'View leads' },
  'leads.write': { area: 'Leads & data', label: 'Add and edit leads' },
  'imports.manage': { area: 'Leads & data', label: 'Import CSV / Excel files' },
  'suppression.manage': { area: 'Leads & data', label: 'Manage the suppression list' },
  'consent.manage': { area: 'Leads & data', label: 'Record consent' },
  'integrations.read': { area: 'Integrations', label: 'View data sources' },
  'integrations.sync': { area: 'Integrations', label: 'Run a HubSpot sync' },
  'integrations.manage': { area: 'Integrations', label: 'Connect or disconnect HubSpot' },
  'campaigns.read': { area: 'Campaigns & compliance', label: 'View campaigns' },
  'campaigns.manage': {
    area: 'Campaigns & compliance',
    label: 'Create, start and pause campaigns',
  },
  'campaigns.emergency_stop': { area: 'Campaigns & compliance', label: 'Emergency Stop' },
  'compliance.read': { area: 'Campaigns & compliance', label: 'View compliance decisions' },
  'compliance.review': { area: 'Campaigns & compliance', label: 'Resolve reviews and complaints' },
  'telecom.read': { area: 'Campaigns & compliance', label: 'View telecom identity' },
  'telecom.manage': { area: 'Campaigns & compliance', label: 'Edit telecom identity' },
  'dashboard.read': { area: 'Organization & team', label: 'See the dashboard' },
  'agents.read': { area: 'Campaigns & compliance', label: 'View AI agents' },
  'agents.manage': { area: 'Campaigns & compliance', label: 'Build and edit AI agents' },
};

/** Every permission, grouped by area in display order. */
export function permissionsByArea(): { area: AccessArea; permissions: Permission[] }[] {
  const all = Object.keys(PERMISSION_LABELS) as Permission[];
  return ACCESS_AREAS.map((area) => ({
    area,
    permissions: all.filter((permission) => PERMISSION_LABELS[permission].area === area),
  }));
}
