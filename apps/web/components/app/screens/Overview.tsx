'use client';

import Link from 'next/link';
import { Icon } from '@/components/marketing/primitives';
import type { DashboardSummary, OrganizationStatus } from '@/lib/api/types';
import { formatNumber } from '@/lib/app/format';
import { useSession } from '@/lib/app/session';
import { useResource } from '@/lib/app/use-resource';
import type { IconName } from '@/lib/site/icons';
import { cx } from '@/lib/site/cx';
import { Badge, ErrorBlock, LoadingBlock, Notice, PageHeader, Panel, Stat } from '../ui';
import { CampaignStatusBadge } from './Campaigns';

const STATUS_COPY: Record<OrganizationStatus, { tone: 'info' | 'success' | 'warn'; text: string }> =
  {
    PENDING_APPROVAL: {
      tone: 'info',
      text: 'Your organization is awaiting approval by the Nivomi team. You can set up your team now; AI calling is switched on after approval and compliance checks.',
    },
    ACTIVE: { tone: 'success', text: 'Your organization is approved.' },
    SUSPENDED: {
      tone: 'warn',
      text: 'Your organization is suspended. Contact Nivomi support to restore access.',
    },
    CLOSED: { tone: 'warn', text: 'This organization is closed.' },
  };

/** Parts of the MVP not built yet — shown honestly as upcoming. */
const UPCOMING: readonly { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'i-phone',
    title: 'Live AI calls & call history',
    text: 'Real calls with recordings, transcripts and AI summaries.',
  },
  { icon: 'i-cal', title: 'Appointments', text: 'Qualified leads booked straight from the call.' },
  {
    icon: 'i-link',
    title: 'CRM write-back',
    text: 'Call outcomes, notes and meetings sent back to HubSpot.',
  },
  { icon: 'i-chart', title: 'Usage & billing', text: 'Metered minutes and invoices.' },
];

/** The operations dashboard (MVP mock-up): today at a glance, then what needs attention. */
export function Overview() {
  const { me, can } = useSession();
  const summary = useResource<DashboardSummary>(can('dashboard.read') ? '/dashboard' : null, {
    pollWhile: () => true,
    pollMs: 15_000,
  });
  const organization = me?.organizations.find((o) => o.id === me.activeOrganization?.id);
  if (!me || !organization) return null;
  const status = STATUS_COPY[organization.status];
  const data = summary.data;

  return (
    <div className="grid gap-8">
      <PageHeader
        title={`Welcome, ${me.user.name.split(' ')[0] ?? me.user.name}`}
        description={`Your ${organization.name} operations at a glance.`}
        actions={
          can('campaigns.manage') ? (
            <Link href="/app/campaigns/new" className="btn btn-primary btn-sm">
              New campaign
            </Link>
          ) : null
        }
      />
      {organization.status !== 'ACTIVE' ? <Notice tone={status.tone}>{status.text}</Notice> : null}

      {summary.error && !data ? (
        <ErrorBlock message={summary.error} onRetry={summary.reload} />
      ) : null}
      {can('dashboard.read') && !data && !summary.error ? (
        <LoadingBlock label="Loading today’s numbers" />
      ) : null}

      {data ? (
        <>
          <section aria-labelledby="today-heading" className="grid gap-3">
            <h2 id="today-heading" className="sr-only">
              Today
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Calls today" value={formatNumber(data.today.dialled)} />
              <Stat
                label="Answer rate"
                value={
                  data.today.answerRate === null
                    ? '—'
                    : `${Math.round(data.today.answerRate * 100)}%`
                }
              />
              <Stat
                label="Qualified leads"
                value={formatNumber(data.leads.qualified)}
                tone="live"
              />
              <Stat label="Appointments booked" value={formatNumber(data.leads.appointments)} />
            </div>
            <p className="text-[13px] text-muted">
              “Today” is the calendar day in {data.timezone.replace('_', ' ')}. Figures refresh
              every 15 seconds.
            </p>
          </section>

          <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
            <Panel title="Call funnel" description="Today, from first dial to a qualified lead.">
              <Funnel stages={data.funnel} />
            </Panel>
            <Panel title="Attention required">
              {data.attention.length === 0 ? (
                <p className="text-sm text-muted">Nothing needs attention right now.</p>
              ) : (
                <ul className="grid gap-2">
                  {data.attention.map((item) => (
                    <li key={item.code}>
                      <Link
                        href={item.href}
                        className="flex items-center justify-between gap-3 rounded-[12px] border border-line px-4 py-2.5 text-sm transition-colors hover:border-line-hover"
                      >
                        <span className="flex items-center gap-2 text-ink">
                          <Badge tone="warn">
                            {item.severity === 'critical' ? 'Action needed' : 'Check'}
                          </Badge>
                          {item.label}
                        </span>
                        {item.count !== null ? (
                          <span className="font-bold text-ink">{formatNumber(item.count)}</span>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          {can('campaigns.read') ? (
            <Panel
              title="Active campaigns"
              description="Progress counts leads the campaign has finished with: called, blocked or excluded."
            >
              {data.campaigns.length === 0 ? (
                <p className="text-sm text-muted">
                  No running, scheduled or paused campaigns.{' '}
                  <Link href="/app/campaigns" className="font-semibold text-accent hover:underline">
                    View all campaigns
                  </Link>
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs tracking-[0.08em] text-muted uppercase">
                      <tr>
                        <th className="py-2 pr-4 font-bold">Campaign</th>
                        <th className="py-2 pr-4 font-bold">Status</th>
                        <th className="py-2 pr-4 text-right font-bold">Calls</th>
                        <th className="py-2 font-bold">Progress</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.campaigns.map((c) => {
                        const share = c.leads > 0 ? c.settled / c.leads : 0;
                        return (
                          <tr key={c.id} className="border-t border-line">
                            <td className="py-3 pr-4">
                              <Link
                                href={`/app/campaigns/${c.id}`}
                                className="font-semibold text-ink hover:text-accent"
                              >
                                {c.name}
                              </Link>
                            </td>
                            <td className="py-3 pr-4">
                              <CampaignStatusBadge status={c.status} pauseReason={c.pauseReason} />
                            </td>
                            <td className="py-3 pr-4 text-right tabular-nums text-ink-2">
                              {formatNumber(c.calls)}
                            </td>
                            <td className="py-3">
                              <Meter
                                value={share}
                                label={`${formatNumber(c.settled)} of ${formatNumber(c.leads)} leads`}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          ) : null}
        </>
      ) : null}

      {data && data.leads.total === 0 ? <SetupSteps /> : null}

      <Panel
        title="Coming to your workspace"
        description="In development; each appears here when it ships."
      >
        <ul className="grid gap-3 sm:grid-cols-2">
          {UPCOMING.map((item) => (
            <li key={item.title} className="flex gap-3 rounded-[14px] border border-line p-4">
              <span className="icon-tile shrink-0">
                <Icon name={item.icon} />
              </span>
              <span>
                <span className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                  {item.title}
                  <span className="rounded-full border border-soon/25 bg-soon-soft px-2 py-0.5 text-[11px] font-bold text-soon">
                    In development
                  </span>
                </span>
                <span className="mt-1 block text-sm text-muted">{item.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

/**
 * Single-series horizontal bars (one validated hue, `--nv-chart-1`): ≤ 24px thick, 4px rounded
 * data end, square at the baseline, value at the tip in text ink. Each row is focusable and
 * shows its conversion on hover and focus; the list itself is the table view.
 */
function Funnel({ stages }: { readonly stages: DashboardSummary['funnel'] }) {
  const max = Math.max(1, ...stages.map((s) => s.count));
  return (
    <ol className="grid gap-3" aria-label="Call funnel, today">
      {stages.map((stage, index) => {
        const previous = index > 0 ? (stages[index - 1]?.count ?? 0) : null;
        const conversion =
          previous === null
            ? null
            : previous > 0
              ? `${Math.round((stage.count / previous) * 100)}% of ${stages[index - 1]?.stage.toLowerCase()}`
              : '—';
        return (
          <li
            key={stage.stage}
            tabIndex={0}
            aria-label={`${stage.stage}: ${formatNumber(stage.count)}${conversion ? `, ${conversion}` : ''}`}
            className="group relative grid grid-cols-[112px_1fr] items-center gap-3 rounded-[8px] outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <span className="text-sm text-ink-2">{stage.stage}</span>
            <span className="flex items-center gap-2">
              <span
                className="h-5 rounded-r-[4px] bg-chart-1 transition-opacity group-hover:opacity-80"
                style={{ width: `${(stage.count / max) * 85}%` }}
                aria-hidden="true"
              />
              <span className="text-sm font-semibold text-ink">{formatNumber(stage.count)}</span>
            </span>
            {conversion ? (
              <span
                role="tooltip"
                className="pointer-events-none absolute -top-8 left-[124px] z-10 hidden rounded-[8px] border border-line bg-card px-2.5 py-1 text-xs text-ink shadow-sm group-hover:block group-focus-visible:block"
              >
                <strong>{formatNumber(stage.count)}</strong>{' '}
                <span className="text-muted">· {conversion}</span>
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/** Progress meter: the fill and a lighter step of the same ramp as the track. */
function Meter({ value, label }: { readonly value: number; readonly label: string }) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="flex items-center gap-3">
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={label}
        className="h-2 w-32 overflow-hidden rounded-full bg-accent-soft"
      >
        <div className={cx('h-full rounded-full bg-chart-1')} style={{ width: `${percent}%` }} />
      </div>
      <span className="text-[13px] text-muted">{label}</span>
    </div>
  );
}

function SetupSteps() {
  const { can } = useSession();
  const steps = [
    ...(can('imports.manage')
      ? [{ label: 'Bring in your leads (file or HubSpot)', href: '/app/data-sources' }]
      : []),
    ...(can('telecom.read')
      ? [{ label: 'Record your telecom identity and caller numbers', href: '/app/telecom' }]
      : []),
    ...(can('agents.manage')
      ? [{ label: 'Design and publish an AI agent', href: '/app/agents' }]
      : []),
    ...(can('members.invite') ? [{ label: 'Invite your team', href: '/app/team' }] : []),
    { label: 'Review your security settings', href: '/app/security' },
  ];
  return (
    <Panel title="Get set up" description="A few steps before your first campaign.">
      <ol className="grid gap-2">
        {steps.map((step) => (
          <li
            key={step.label}
            className="flex items-center gap-3 rounded-[12px] border border-line px-4 py-3"
          >
            <span className="font-semibold text-ink">{step.label}</span>
            <Link
              href={step.href}
              className="ml-auto text-sm font-semibold text-accent hover:underline"
            >
              Open
            </Link>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
