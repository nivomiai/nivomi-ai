'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from '@/components/marketing/primitives';
import type { DashboardSummary, OrganizationStatus } from '@/lib/api/types';
import { formatNumber } from '@/lib/app/format';
import { useSession } from '@/lib/app/session';
import { useResource } from '@/lib/app/use-resource';
import type { IconName } from '@/lib/site/icons';
import { cx } from '@/lib/site/cx';
import { ErrorBlock, LoadingBlock, Notice, Panel } from '../ui';
import { CampaignStatusBadge } from './Campaigns';

type Tone = 'info' | 'success' | 'warn';

const STATUS_COPY: Record<OrganizationStatus, { tone: Tone; label: string; text: string | null }> =
  {
    PENDING_APPROVAL: {
      tone: 'info',
      label: 'Pending approval',
      text: 'Your workspace is awaiting approval by the Nivomi team. Set up your team now — AI calling switches on after approval and compliance checks.',
    },
    ACTIVE: { tone: 'success', label: 'Active', text: null },
    SUSPENDED: {
      tone: 'warn',
      label: 'Suspended',
      text: 'Your workspace is suspended. Contact Nivomi support to restore access.',
    },
    CLOSED: { tone: 'warn', label: 'Closed', text: 'This workspace is closed.' },
  };

/** Parts of the MVP not built yet — shown honestly so operators are not surprised. */
const UPCOMING: readonly { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'i-phone',
    title: 'Live AI calls & call history',
    text: 'Real calls with recordings, transcripts and AI summaries.',
  },
  { icon: 'i-cal', title: 'Appointments', text: 'Qualified leads booked straight from the call.' },
  {
    icon: 'i-link',
    title: 'External CRM connectors',
    text: 'Two-way sync with your CRM — not in the MVP.',
  },
  { icon: 'i-chart', title: 'Usage & billing', text: 'Metered minutes and monthly invoices.' },
];

/** Operations dashboard: today at a glance, what needs attention, how campaigns are tracking. */
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
  const firstName = me.user.name.split(' ')[0] ?? me.user.name;
  const greeting = greet(firstName);

  return (
    <div className="grid gap-8">
      <DashHeader
        greeting={greeting}
        organizationName={organization.name}
        statusLabel={status.label}
        statusTone={status.tone}
        timezone={data?.timezone}
        action={
          can('campaigns.manage') ? (
            <Link href="/app/campaigns/new" className="btn btn-primary btn-sm">
              <Icon name="i-plus" className="size-4" />
              New campaign
            </Link>
          ) : null
        }
      />

      <TrialNotice trialEndsAt={organization.trialEndsAt} />
      {status.text ? <Notice tone={status.tone}>{status.text}</Notice> : null}

      {summary.error && !data ? (
        <ErrorBlock message={summary.error} onRetry={summary.reload} />
      ) : null}
      {can('dashboard.read') && !data && !summary.error ? (
        <LoadingBlock label="Loading today’s numbers" />
      ) : null}

      {data ? <OnboardingChecklist setup={data.setup} status={organization.status} /> : null}

      {data ? (
        <>
          <KpiRow data={data} />

          <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
            <Panel title="Call funnel" description="Today, from first dial to a qualified lead.">
              <Funnel stages={data.funnel} />
            </Panel>
            <AttentionPanel items={data.attention} />
          </div>

          {can('campaigns.read') ? (
            <Panel
              title="Campaigns in flight"
              description="Running, scheduled or paused. Progress counts leads the campaign has finished with — called, blocked or excluded."
              action={
                data.campaigns.length > 0 ? (
                  <Link
                    href="/app/campaigns"
                    className="text-[13px] font-semibold text-accent hover:underline"
                  >
                    All campaigns →
                  </Link>
                ) : null
              }
            >
              {data.campaigns.length === 0 ? (
                <p className="text-sm text-muted">
                  No campaigns are running right now.{' '}
                  <Link href="/app/campaigns" className="font-semibold text-accent hover:underline">
                    Open the campaigns page
                  </Link>{' '}
                  to start one.
                </p>
              ) : (
                <CampaignList campaigns={data.campaigns} />
              )}
            </Panel>
          ) : null}
        </>
      ) : null}

      <Panel
        title="Coming to your workspace"
        description="In development; each capability appears here when it ships."
      >
        <ul className="grid gap-3 sm:grid-cols-2">
          {UPCOMING.map((item) => (
            <li
              key={item.title}
              className="flex gap-3 rounded-[14px] border border-line bg-surface p-4"
            >
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
 * Shows days remaining in the 7-day free trial, or an expired-trial reminder. Soft only — nothing
 * is blocked yet; hard enforcement arrives with the Razorpay billing phase. Null trialEndsAt
 * (orgs created before the feature) is silent.
 */
function TrialNotice({ trialEndsAt }: { readonly trialEndsAt: string | null }) {
  if (!trialEndsAt) return null;
  const endsAt = new Date(trialEndsAt);
  if (Number.isNaN(endsAt.getTime())) return null;
  const msLeft = endsAt.getTime() - Date.now();
  const daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000));
  if (msLeft > 0) {
    const label =
      daysLeft === 1 ? '1 day left in your free trial' : `${daysLeft} days left in your free trial`;
    return (
      <Notice tone="info">
        <span className="font-semibold text-ink">{label}.</span>{' '}
        After it ends, calls remain available while you choose a plan.{' '}
        <Link className="font-semibold text-accent hover:underline" href="/#plans">
          See plans →
        </Link>
      </Notice>
    );
  }
  return (
    <Notice tone="warn">
      <span className="font-semibold text-ink">Your free trial has ended.</span>{' '}
      Nothing is blocked yet, but please pick a plan to keep calling without interruption.{' '}
      <Link className="font-semibold text-accent hover:underline" href="/#plans">
        Choose a plan →
      </Link>
    </Notice>
  );
}

/** Compact page header: greeting, workspace line, and a single primary action. */
function DashHeader({
  greeting,
  organizationName,
  statusLabel,
  statusTone,
  timezone,
  action,
}: {
  readonly greeting: string;
  readonly organizationName: string;
  readonly statusLabel: string;
  readonly statusTone: Tone;
  readonly timezone: string | undefined;
  readonly action: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[26px] font-extrabold tracking-[-0.025em] text-ink sm:text-[30px]">
          {greeting}
        </h1>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-muted">
          <span className="font-medium text-ink-2">{organizationName}</span>
          <span aria-hidden="true" className="text-line-hover">
            ·
          </span>
          <StatusDot tone={statusTone} label={statusLabel} />
          {timezone ? (
            <>
              <span aria-hidden="true" className="text-line-hover">
                ·
              </span>
              <span>Today in {timezone.replace('_', ' ')}</span>
            </>
          ) : null}
        </p>
      </div>
      {action}
    </header>
  );
}

function StatusDot({ tone, label }: { readonly tone: Tone; readonly label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-semibold text-ink-2">
      <span
        aria-hidden="true"
        className={cx(
          'size-1.5 rounded-full',
          tone === 'success' && 'bg-live',
          tone === 'warn' && 'bg-warn',
          tone === 'info' && 'bg-accent',
        )}
      />
      {label}
    </span>
  );
}

function KpiRow({ data }: { readonly data: DashboardSummary }) {
  const answerRate =
    data.today.answerRate === null ? null : Math.round(data.today.answerRate * 100);
  return (
    <section aria-labelledby="today-heading" className="grid gap-3">
      <h2 id="today-heading" className="sr-only">
        Today
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Calls today"
          value={formatNumber(data.today.dialled)}
          hint={`${formatNumber(data.today.answered)} answered`}
          icon="i-phone"
          primary
        />
        <Kpi
          label="Answer rate"
          value={answerRate === null ? '—' : `${answerRate}%`}
          hint={
            answerRate === null ? 'No calls yet' : `${formatNumber(data.today.connected)} connected`
          }
          icon="i-trend"
        />
        <Kpi
          label="Qualified leads"
          value={formatNumber(data.leads.qualified)}
          hint={`${formatNumber(data.leads.total)} in workspace`}
          icon="i-target"
        />
        <Kpi
          label="Appointments"
          value={formatNumber(data.leads.appointments)}
          hint="Booked by AI"
          icon="i-cal"
        />
      </div>
      <p className="text-[12.5px] text-muted">
        Figures refresh every 15 seconds. “Today” is the calendar day in{' '}
        {data.timezone.replace('_', ' ')}.
      </p>
    </section>
  );
}

function Kpi({
  label,
  value,
  hint,
  icon,
  primary = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly hint: string;
  readonly icon: IconName;
  readonly primary?: boolean;
}) {
  return (
    <div
      className={cx(
        'rounded-[14px] border p-4',
        primary ? 'border-accent-tint bg-accent-soft/60' : 'border-line bg-card',
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold tracking-[0.12em] text-muted uppercase">{label}</p>
        <Icon name={icon} className={cx('size-4', primary ? 'text-accent' : 'text-muted')} />
      </div>
      <p
        className={cx(
          'mt-2 text-[28px] leading-none font-extrabold tracking-[-0.03em] tabular-nums',
          primary ? 'text-accent' : 'text-ink',
        )}
      >
        {value}
      </p>
      <p className="mt-1.5 text-[12.5px] text-muted">{hint}</p>
    </div>
  );
}

function AttentionPanel({ items }: { readonly items: DashboardSummary['attention'] }) {
  return (
    <Panel
      title="Needs attention"
      action={
        items.length > 0 ? (
          <span className="rounded-full border border-warn/30 bg-warn-soft px-2 py-0.5 text-[11px] font-bold text-warn">
            {items.length}
          </span>
        ) : null
      }
    >
      {items.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <span
            aria-hidden="true"
            className="inline-grid size-5 place-items-center rounded-full bg-live-soft text-live"
          >
            <Icon name="i-check" className="size-3" />
          </span>
          All clear right now.
        </p>
      ) : (
        <ul className="grid gap-2">
          {items.map((item) => (
            <li key={item.code}>
              <Link
                href={item.href}
                className="group flex items-center gap-3 rounded-[12px] border border-line bg-surface px-3 py-2.5 transition-colors hover:border-line-hover"
              >
                <span
                  aria-hidden="true"
                  className={cx(
                    'inline-grid size-7 place-items-center rounded-[9px] border',
                    item.severity === 'critical'
                      ? 'border-warn/30 bg-warn-soft text-warn'
                      : 'border-accent-tint bg-accent-soft text-accent',
                  )}
                >
                  <Icon
                    name={item.severity === 'critical' ? 'i-zap' : 'i-clock'}
                    className="size-3.5"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-ink">
                    {item.label}
                  </span>
                  <span className="block text-[12px] text-muted">
                    {item.severity === 'critical' ? 'Action needed' : 'Review when you can'}
                  </span>
                </span>
                {item.count !== null ? (
                  <span className="shrink-0 text-[13.5px] font-bold tabular-nums text-ink">
                    {formatNumber(item.count)}
                  </span>
                ) : null}
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="size-4 shrink-0 text-muted transition-colors group-hover:text-accent"
                >
                  <path
                    d="m9 6 6 6-6 6"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function CampaignList({ campaigns }: { readonly campaigns: DashboardSummary['campaigns'] }) {
  return (
    <ul className="grid gap-2">
      {campaigns.map((c) => {
        const share = c.leads > 0 ? c.settled / c.leads : 0;
        return (
          <li key={c.id}>
            <Link
              href={`/app/campaigns/${c.id}`}
              className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 rounded-[12px] border border-line bg-surface p-3.5 transition-colors hover:border-line-hover sm:grid-cols-[1.5fr_auto_auto_1.2fr]"
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold text-ink">{c.name}</span>
                <span className="mt-0.5 block text-[12.5px] text-muted">
                  {formatNumber(c.calls)} {c.calls === 1 ? 'call' : 'calls'} ·{' '}
                  {formatNumber(c.settled)} of {formatNumber(c.leads)} settled
                </span>
              </span>
              <CampaignStatusBadge status={c.status} pauseReason={c.pauseReason} />
              <span className="hidden text-right text-[13.5px] font-semibold tabular-nums text-ink sm:block">
                {Math.round(share * 100)}%
              </span>
              <span className="col-span-2 sm:col-span-1">
                <Meter value={share} />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
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
              <span className="text-sm font-semibold tabular-nums text-ink">
                {formatNumber(stage.count)}
              </span>
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

function Meter({ value }: { readonly value: number }) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-label={`${percent}% complete`}
      className="h-1.5 overflow-hidden rounded-full bg-accent-soft"
    >
      <div className="h-full rounded-full bg-chart-1" style={{ width: `${percent}%` }} />
    </div>
  );
}

interface SetupStep {
  readonly key: string;
  readonly label: string;
  readonly text: string;
  readonly href: string;
  readonly done: boolean;
  readonly waitingOnApproval?: boolean;
}

/**
 * Four-step path to the first real call: caller number → agent → leads → campaign. Shown while
 * the tenant hasn't finished all four, with each step linking to the right screen. During the
 * PENDING_APPROVAL wait, the user can still prep the first three — the last one unlocks on
 * approval. Once every step is done, the component returns null (the dashboard is enough).
 */
function OnboardingChecklist({
  setup,
  status,
}: {
  readonly setup: DashboardSummary['setup'];
  readonly status: OrganizationStatus;
}) {
  const pending = status === 'PENDING_APPROVAL';
  const steps: SetupStep[] = [
    {
      key: 'caller',
      label: 'Verify your telecom identity + a caller number',
      text: 'The entity and 140xx/1601xx number every outbound dial uses.',
      href: '/app/telecom',
      done: setup.callerNumbersVerified > 0,
    },
    {
      key: 'agent',
      label: 'Publish an AI agent',
      text: 'Design a conversation flow and publish an immutable version.',
      href: '/app/agents',
      done: setup.agentsPublished > 0,
    },
    {
      key: 'leads',
      label: 'Load leads',
      text: 'Upload a CSV or XLSX, or POST /leads from your backend.',
      href: '/app/data-sources',
      done: setup.hasLeads,
    },
    {
      key: 'campaign',
      label: 'Create and launch a campaign',
      text: pending ? 'Available after your workspace is approved.' : 'Pre-launch check + Emergency Stop guard every dial.',
      href: '/app/campaigns/new',
      done: setup.campaignCount > 0,
      waitingOnApproval: pending,
    },
  ];
  const openCount = steps.filter((s) => !s.done).length;
  if (openCount === 0) return null;

  const title = pending ? 'Set up while you wait for approval' : 'You are nearly ready to call';
  const description = pending
    ? 'Your workspace is pending approval. Prep the first three steps now so launching a campaign is one click once Nivomi approves you.'
    : `${openCount} of ${steps.length} steps remaining before your first live call.`;

  return (
    <Panel title={title} description={description}>
      <ol className="grid gap-2">
        {steps.map((step, index) => (
          <li key={step.key}>
            <Link
              href={step.href}
              aria-disabled={step.waitingOnApproval ? true : undefined}
              className={cx(
                'group flex items-center gap-3 rounded-[12px] border px-4 py-3 transition-colors',
                step.done
                  ? 'border-live/25 bg-live-soft/40'
                  : step.waitingOnApproval
                    ? 'border-line bg-soft/40 opacity-70'
                    : 'border-line bg-surface hover:border-line-hover',
              )}
            >
              <span
                aria-hidden="true"
                className={cx(
                  'inline-grid size-7 place-items-center rounded-full text-[12.5px] font-bold',
                  step.done
                    ? 'bg-live text-white'
                    : 'border border-accent-tint bg-accent-soft text-accent',
                )}
              >
                {step.done ? '✓' : index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cx(
                    'block font-semibold',
                    step.done ? 'text-ink-2 line-through' : 'text-ink',
                  )}
                >
                  {step.label}
                </span>
                <span className="block text-[13px] text-muted">{step.text}</span>
              </span>
              {!step.done ? (
                <span className="text-[13px] font-semibold text-accent group-hover:underline">
                  {step.waitingOnApproval ? 'Blocked' : 'Open →'}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function greet(firstName: string): string {
  const hour = new Date().getHours();
  if (hour < 5) return `Up late, ${firstName}`;
  if (hour < 12) return `Good morning, ${firstName}`;
  if (hour < 17) return `Good afternoon, ${firstName}`;
  if (hour < 21) return `Good evening, ${firstName}`;
  return `Hello, ${firstName}`;
}
