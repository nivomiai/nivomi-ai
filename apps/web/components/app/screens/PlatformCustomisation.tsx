'use client';

import { useSession } from '@/lib/app/session';
import { Badge, EmptyState, Notice, PageHeader, Panel } from '../ui';

const PLAN_OPTIONS = ['Starter', 'Growth', 'Business', 'Enterprise'] as const;

const FEATURE_FLAGS = [
  {
    id: 'calling_outbound',
    label: 'Outbound calling',
    description: 'Place calls through the dialer and run campaigns.',
    enabled: true,
  },
  {
    id: 'crm_external',
    label: 'External CRM sync',
    description: 'OAuth connection, contact/lead sync, call-outcome write-back. Not in MVP.',
    enabled: false,
  },
  {
    id: 'imports_csv',
    label: 'CSV / XLSX import',
    description: 'Signed uploads, mapping, dedupe review, chunked ingestion jobs.',
    enabled: true,
  },
  {
    id: 'compliance_review',
    label: 'Compliance review queue',
    description: 'Manual resolution of REQUIRES_REVIEW eligibility checks.',
    enabled: false,
  },
] as const;

export function PlatformCustomisation() {
  const { me } = useSession();

  if (!me?.user.isSuperAdmin) {
    return (
      <div className="grid gap-8">
        <PageHeader title="Customisation" />
        <EmptyState icon="i-shield" title="Super Admin only">
          <p>Only a platform Super Admin may open this section.</p>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Customisation"
        description="Per-organization plan, feature flags, branding and limits. Persisting these changes lands with the billing phase — the controls below are visual previews until then."
      />

      <Notice tone="info">
        No organization is selected yet. In the next build, pick an organization from the
        Organizations tab to edit its plan, flags, and branding here.
      </Notice>

      <Panel title="Plan" description="The subscription tier that governs limits and billing.">
        <div className="grid gap-3 sm:grid-cols-4">
          {PLAN_OPTIONS.map((plan) => (
            <div
              key={plan}
              aria-disabled="true"
              className="rounded-[12px] border border-line bg-soft/40 p-4 opacity-70"
            >
              <p className="font-semibold text-ink">{plan}</p>
              <p className="mt-1 text-[12.5px] text-muted">
                {plan === 'Starter' ? 'Up to 2,000 calls / month' : null}
                {plan === 'Growth' ? 'Up to 15,000 calls / month' : null}
                {plan === 'Business' ? 'Up to 60,000 calls / month' : null}
                {plan === 'Enterprise' ? 'Custom volume & SLA' : null}
              </p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        title="Feature flags"
        description="Turn capabilities on or off per organization without a release."
      >
        <ul className="grid gap-3">
          {FEATURE_FLAGS.map((flag) => (
            <li
              key={flag.id}
              className="flex items-start justify-between gap-4 rounded-[12px] border border-line bg-soft/40 p-4"
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-[14.5px] font-semibold text-ink">
                  {flag.label}
                  <Badge tone={flag.enabled ? 'live' : 'neutral'}>
                    {flag.enabled ? 'On' : 'Off'}
                  </Badge>
                </p>
                <p className="mt-1 text-[12.5px] text-muted">{flag.description}</p>
              </div>
              <span
                aria-hidden="true"
                className={`inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors ${
                  flag.enabled ? 'border-accent bg-accent/80' : 'border-line bg-soft'
                }`}
              >
                <span
                  className={`size-5 translate-x-0.5 rounded-full bg-white transition-transform ${
                    flag.enabled ? 'translate-x-5' : ''
                  }`}
                />
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Branding" description="Logo, colour and the from-name on outbound emails.">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <p className="text-xs font-bold tracking-[0.12em] text-muted uppercase">Logo</p>
            <div className="mt-2 grid h-24 place-items-center rounded-[12px] border border-dashed border-line bg-soft/40 text-sm text-muted">
              Drop an SVG or PNG (coming soon)
            </div>
          </div>
          <div>
            <p className="text-xs font-bold tracking-[0.12em] text-muted uppercase">
              Accent colour
            </p>
            <div className="mt-2 grid grid-cols-6 gap-2">
              {['#CC007E', '#6D4BD8', '#0F8A4A', '#1D4ED8', '#B45309', '#111827'].map((hex) => (
                <span
                  key={hex}
                  aria-hidden="true"
                  className="size-10 rounded-full border border-line opacity-80"
                  style={{ backgroundColor: hex }}
                />
              ))}
            </div>
          </div>
          <div className="sm:col-span-2">
            <label
              htmlFor="customisation-from-name"
              className="text-xs font-bold tracking-[0.12em] text-muted uppercase"
            >
              Outbound email from-name
            </label>
            <input
              id="customisation-from-name"
              type="text"
              disabled
              placeholder="Nivomi AI"
              className="mt-2 h-11 w-full rounded-[12px] border border-line bg-soft/40 px-3 text-sm text-ink opacity-70"
            />
          </div>
        </div>
      </Panel>

      <Panel
        title="Limits"
        description="Hard ceilings for calls, imports and seats, enforced by the API."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: 'Calls / day', value: '5,000' },
            { label: 'Seats', value: '25' },
            { label: 'Imports / month', value: '10' },
          ].map((item) => (
            <div key={item.label} className="rounded-[12px] border border-line bg-soft/40 p-4">
              <p className="text-xs font-bold tracking-[0.12em] text-muted uppercase">
                {item.label}
              </p>
              <p className="mt-2 text-[20px] font-bold text-ink">{item.value}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
