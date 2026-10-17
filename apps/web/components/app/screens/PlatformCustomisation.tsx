'use client';

import Link from 'next/link';
import type { Plan, UsageEventKind } from '@/lib/api/types';
import { USAGE_KIND_LABELS } from '@/lib/api/types';
import { useSession } from '@/lib/app/session';
import { useResource } from '@/lib/app/use-resource';
import { Badge, EmptyState, ErrorBlock, LoadingBlock, Notice, PageHeader, Panel } from '../ui';

function formatRupees(paise: number): string {
  if (paise <= 0) return 'Custom';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

function limitSummary(plan: Plan): string {
  const outbound = plan.limits.CALL_MINUTES_OUTBOUND;
  if (typeof outbound === 'number') return `${outbound.toLocaleString()} outbound minutes / month`;
  const first = Object.entries(plan.limits).find(([, v]) => typeof v === 'number') as
    | [UsageEventKind, number]
    | undefined;
  if (!first) return 'No metered limits';
  return `${USAGE_KIND_LABELS[first[0]]}: ${first[1].toLocaleString()}`;
}

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
  const plansResource = useResource<{ items: Plan[] }>(
    me?.user.isSuperAdmin ? '/platform/plans' : null,
  );

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

  const activePlans = (plansResource.data?.items ?? []).filter((p) => p.status === 'ACTIVE');

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Customisation"
        description="Per-organization plan, feature flags, branding and limits. The plan catalogue below is live — manage it on the Plans page. Per-org editing lands with the billing phase."
      />

      <Notice tone="info">
        No organization is selected yet. In the next build, pick an organization from the
        Organizations tab to assign one of the plans below. For now, the catalogue is read-only
        here — edit it on <Link className="font-semibold text-accent hover:underline" href="/app/platform/plans">Plans</Link>.
      </Notice>

      <Panel
        title="Plan catalogue"
        description="Live from the plans table. These are the choices the super admin will pick from when assigning an org."
        action={
          <Link href="/app/platform/plans" className="btn btn-secondary btn-sm">
            Open Plans
          </Link>
        }
      >
        {plansResource.error ? (
          <ErrorBlock message={plansResource.error} onRetry={plansResource.reload} />
        ) : plansResource.loading && !plansResource.data ? (
          <LoadingBlock label="Loading plans" />
        ) : activePlans.length === 0 ? (
          <EmptyState icon="i-layers" title="No active plans yet">
            <p>
              Create one on the <Link className="font-semibold text-accent hover:underline" href="/app/platform/plans">Plans</Link> page.
            </p>
          </EmptyState>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {activePlans.map((plan) => (
              <div key={plan.id} className="rounded-[12px] border border-line bg-soft/40 p-4">
                <p className="font-semibold text-ink">{plan.name}</p>
                <p className="mt-1 text-[12.5px] text-muted">{formatRupees(plan.monthlyPaiseInr)} / month</p>
                <p className="mt-1 text-[12.5px] text-muted">{limitSummary(plan)}</p>
                {plan.orgsActive > 0 ? (
                  <p className="mt-2">
                    <Badge tone="accent">
                      {plan.orgsActive} org{plan.orgsActive === 1 ? '' : 's'}
                    </Badge>
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
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
              {['#C2410C', '#6D4BD8', '#0F8A4A', '#1D4ED8', '#B45309', '#111827'].map((hex) => (
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
