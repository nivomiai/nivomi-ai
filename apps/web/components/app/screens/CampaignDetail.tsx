'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  CALL_CATEGORY_LABELS,
  LEAD_STATE_LABELS,
  OUTCOME_LABELS,
  reasonLabel,
  type CallAttempt,
  type Campaign,
  type CampaignLead,
  type CampaignLeadState,
  type Page,
} from '@/lib/api/types';
import { api } from '@/lib/app/api';
import { formatDateTime, formatNumber, formatPhone } from '@/lib/app/format';
import { useSession } from '@/lib/app/session';
import { useResource } from '@/lib/app/use-resource';
import { useSubmit } from '@/lib/app/use-submit';
import {
  Badge,
  EmptyState,
  ErrorBlock,
  FormAlert,
  LoadingBlock,
  Notice,
  PageHeader,
  Panel,
  SelectField,
  Stat,
} from '../ui';
import { CampaignStatusBadge, RuleSetNotice } from './Campaigns';

const ACTIVE = new Set(['RUNNING', 'SCHEDULED']);

function isBusy(c: Campaign): boolean {
  return ACTIVE.has(c.status) || c.prelaunch?.status === 'RUNNING' || c.progress.liveCalls > 0;
}

export function CampaignDetail({ id }: { readonly id: string }) {
  const { can } = useSession();
  const campaign = useResource<Campaign>(`/campaigns/${id}`, { pollWhile: isBusy, pollMs: 2_000 });

  if (campaign.error && !campaign.data) {
    return (
      <div className="grid gap-6">
        <PageHeader title="Campaign" />
        <ErrorBlock message={campaign.error} onRetry={campaign.reload} />
      </div>
    );
  }
  if (!campaign.data) return <LoadingBlock label="Loading campaign" />;
  const c = campaign.data;
  const launched = !['DRAFT', 'CANCELLED'].includes(c.status);

  return (
    <div className="grid gap-8">
      <div>
        <Link href="/app/campaigns" className="text-sm font-semibold text-accent hover:underline">
          ← All campaigns
        </Link>
        <div className="mt-3">
          <PageHeader
            title={c.name}
            description={`${CALL_CATEGORY_LABELS[c.callCategory]} · ${c.type === 'CONTINUOUS' ? 'continuous' : 'fixed list'} · ${c.windowStart}–${c.windowEnd} recipient time`}
            actions={<CampaignStatusBadge status={c.status} pauseReason={c.pauseReason} />}
          />
        </div>
      </div>
      <RuleSetNotice />
      {can('campaigns.manage') ? <Actions campaign={c} onDone={campaign.reload} /> : null}

      {c.status === 'DRAFT' || c.prelaunch ? <PrelaunchPanel campaign={c} /> : null}
      {launched ? <ProgressPanel campaign={c} /> : null}
      {launched || c.prelaunch?.status === 'COMPLETED' ? (
        <LeadsPanel id={c.id} busy={isBusy(c)} />
      ) : null}
      {launched ? <AttemptsPanel id={c.id} busy={isBusy(c)} /> : null}
      <SettingsPanel campaign={c} />
    </div>
  );
}

function Actions({
  campaign: c,
  onDone,
}: {
  readonly campaign: Campaign;
  readonly onDone: () => void;
}) {
  const submit = useSubmit();
  const act = (path: string) =>
    void submit
      .run(() => api.post(`/campaigns/${c.id}/${path}`))
      .then((ok) => {
        if (ok) onDone();
      });
  const check = c.prelaunch;
  const canLaunch =
    check?.status === 'COMPLETED' && !check.stale && check.eligible + check.deferred > 0;
  const button = (label: string, path: string, primary = false, disabled = false) => (
    <button
      type="button"
      className={primary ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
      disabled={submit.pending || disabled}
      onClick={() => act(path)}
    >
      {label}
    </button>
  );
  return (
    <div className="grid gap-3">
      <FormAlert message={submit.error} />
      <div className="flex flex-wrap gap-2">
        {c.status === 'DRAFT' ? (
          <>
            {button(
              check ? 'Run the check again' : 'Run pre-launch check',
              'prelaunch-check',
              !canLaunch,
              check?.status === 'RUNNING',
            )}
            {button('Launch', 'launch', canLaunch, !canLaunch)}
            <Link href={`/app/campaigns/${c.id}/edit`} className="btn btn-secondary btn-sm">
              Edit
            </Link>
            {button('Cancel campaign', 'cancel')}
          </>
        ) : null}
        {ACTIVE.has(c.status) ? button('Pause', 'pause') : null}
        {c.status === 'PAUSED' ? button('Resume', 'resume', true) : null}
        {['RUNNING', 'SCHEDULED', 'PAUSED'].includes(c.status)
          ? button('Stop for good', 'stop')
          : null}
      </div>
    </div>
  );
}

function ReasonTable({ entries }: { readonly entries: [string, number][] }) {
  if (entries.length === 0) return null;
  return (
    <ul className="grid gap-2">
      {entries.map(([code, count]) => (
        <li
          key={code}
          className="flex items-center justify-between gap-4 rounded-[12px] border border-line px-4 py-2.5 text-sm"
        >
          <span className="text-ink">
            {reasonLabel(code)} <code className="ml-1 text-xs text-muted">{code}</code>
          </span>
          <span className="font-bold text-ink">{formatNumber(count)}</span>
        </li>
      ))}
    </ul>
  );
}

/** FR-36: how many leads are eligible, blocked (by reason), deferred or need review. */
function PrelaunchPanel({ campaign: c }: { readonly campaign: Campaign }) {
  const check = c.prelaunch;
  return (
    <Panel
      title="Pre-launch check"
      description="A dry run of eligibility over the selection. Launch needs at least one lead that is eligible now or later (deferred)."
    >
      {!check ? (
        <p className="text-sm text-muted">Not run yet.</p>
      ) : check.status === 'RUNNING' ? (
        <LoadingBlock label="Checking every lead" />
      ) : (
        <div className="grid gap-5">
          {check.stale ? (
            <Notice tone="warn">The campaign changed after this check. Run it again.</Notice>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Eligible" value={formatNumber(check.eligible)} tone="live" />
            <Stat label="Deferred" value={formatNumber(check.deferred)} />
            <Stat label="Blocked" value={formatNumber(check.blocked)} tone="warn" />
            <Stat label="Needs review" value={formatNumber(check.review)} tone="warn" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-ink">Reasons</h3>
            <div className="mt-2">
              <ReasonTable entries={Object.entries(check.byReason).sort((a, b) => b[1] - a[1])} />
              {Object.keys(check.byReason).length === 0 ? (
                <p className="text-sm text-muted">Every lead passed every check.</p>
              ) : null}
            </div>
          </div>
          <p className="text-[13px] text-muted">
            {formatNumber(check.total)} leads checked
            {check.completedAt ? ` · ${formatDateTime(check.completedAt)}` : ''}
            {check.ruleSetVersion ? ` · rule set v${check.ruleSetVersion}` : ''}
          </p>
        </div>
      )}
    </Panel>
  );
}

/** FR-42: live calls, counts per state, blocks by reason, budget, remaining. */
function ProgressPanel({ campaign: c }: { readonly campaign: Campaign }) {
  const p = c.progress;
  const usedMinutes = Math.ceil(c.usedSeconds / 60);
  const reasons = new Map<string, number>();
  for (const r of p.reasons) {
    const key = `${LEAD_STATE_LABELS[r.state]}: ${reasonLabel(r.code)}`;
    reasons.set(key, (reasons.get(key) ?? 0) + r.count);
  }
  return (
    <Panel title="Progress">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat
          label="Live calls"
          value={formatNumber(p.liveCalls)}
          tone={p.liveCalls ? 'live' : 'neutral'}
        />
        <Stat label="Remaining" value={formatNumber(p.remaining)} />
        <Stat label="Done" value={formatNumber(p.leadsByState.DONE ?? 0)} />
        <Stat
          label="Minutes used"
          value={`${formatNumber(usedMinutes)} / ${formatNumber(c.budgetMinutes)}`}
          tone={usedMinutes >= c.budgetMinutes ? 'warn' : 'neutral'}
        />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-bold text-ink">Leads by state</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {(Object.entries(p.leadsByState) as [CampaignLeadState, number][]).map(([state, n]) => (
              <li key={state}>
                <Badge
                  tone={
                    state === 'BLOCKED' || state === 'REVIEW'
                      ? 'warn'
                      : state === 'DONE'
                        ? 'live'
                        : 'neutral'
                  }
                >
                  {LEAD_STATE_LABELS[state]} · {formatNumber(n)}
                </Badge>
              </li>
            ))}
          </ul>
          <h3 className="mt-5 text-sm font-bold text-ink">Call outcomes</h3>
          {Object.keys(p.outcomes).length === 0 ? (
            <p className="mt-2 text-sm text-muted">No calls finished yet.</p>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-2">
              {Object.entries(p.outcomes).map(([outcome, n]) => (
                <li key={outcome}>
                  <Badge>
                    {OUTCOME_LABELS[outcome as keyof typeof OUTCOME_LABELS] ?? outcome} ·{' '}
                    {formatNumber(n)}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="text-sm font-bold text-ink">Blocked, deferred and review reasons</h3>
          <div className="mt-2">
            {reasons.size === 0 ? (
              <p className="text-sm text-muted">None.</p>
            ) : (
              <ReasonTable entries={[...reasons.entries()]} />
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function LeadsPanel({ id, busy }: { readonly id: string; readonly busy: boolean }) {
  const [state, setState] = useState('');
  const leads = useResource<Page<CampaignLead>>(
    `/campaigns/${id}/leads?limit=100${state ? `&state=${state}` : ''}`,
    { pollWhile: () => busy, pollMs: 3_000 },
  );
  return (
    <Panel title="Leads">
      <SelectField
        id="lead-state-filter"
        label="State"
        value={state}
        onChange={setState}
        options={[
          { value: '', label: 'Any state' },
          ...(Object.keys(LEAD_STATE_LABELS) as CampaignLeadState[]).map((s) => ({
            value: s,
            label: LEAD_STATE_LABELS[s],
          })),
        ]}
        className="max-w-xs"
      />
      <div className="mt-4">
        {!leads.data ? (
          leads.error ? (
            <ErrorBlock message={leads.error} onRetry={leads.reload} />
          ) : (
            <LoadingBlock />
          )
        ) : leads.data.items.length === 0 ? (
          <EmptyState icon="i-target" title="No leads in this state" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs tracking-[0.08em] text-muted uppercase">
                <tr>
                  <th className="py-2 pr-4 font-bold">Lead</th>
                  <th className="py-2 pr-4 font-bold">State</th>
                  <th className="py-2 pr-4 font-bold">Why</th>
                  <th className="py-2 font-bold">Attempts</th>
                </tr>
              </thead>
              <tbody>
                {leads.data.items.map((l) => (
                  <tr key={l.id} className="border-t border-line align-top">
                    <td className="py-3 pr-4">
                      <Link
                        href={`/app/leads/${l.leadId}`}
                        className="font-semibold text-ink hover:text-accent"
                      >
                        {l.fullName}
                      </Link>
                      <p className="text-[13px] text-muted">{formatPhone(l.phone)}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <Badge
                        tone={
                          l.state === 'BLOCKED' || l.state === 'REVIEW'
                            ? 'warn'
                            : l.state === 'DONE'
                              ? 'live'
                              : 'neutral'
                        }
                      >
                        {LEAD_STATE_LABELS[l.state]}
                      </Badge>
                      {l.nextAttemptAt && (l.state === 'WAITING' || l.state === 'PENDING') ? (
                        <p className="mt-1 text-[13px] text-muted">
                          Next: {formatDateTime(l.nextAttemptAt)}
                        </p>
                      ) : null}
                    </td>
                    <td className="py-3 pr-4 text-ink-2">
                      {l.lastOutcome
                        ? OUTCOME_LABELS[l.lastOutcome]
                        : l.lastReasons.map(reasonLabel).join(', ') || '—'}
                    </td>
                    <td className="py-3 text-ink-2">{l.attemptsMade}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Panel>
  );
}

function AttemptsPanel({ id, busy }: { readonly id: string; readonly busy: boolean }) {
  const attempts = useResource<Page<CallAttempt>>(`/campaigns/${id}/attempts?limit=25`, {
    pollWhile: () => busy,
    pollMs: 3_000,
  });
  return (
    <Panel
      title="Recent calls"
      description="Placed through the simulated dialer until telephony is connected."
    >
      {!attempts.data ? (
        attempts.error ? (
          <ErrorBlock message={attempts.error} onRetry={attempts.reload} />
        ) : (
          <LoadingBlock />
        )
      ) : attempts.data.items.length === 0 ? (
        <p className="text-sm text-muted">No calls yet.</p>
      ) : (
        <ul className="grid gap-2">
          {attempts.data.items.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-line px-4 py-2.5 text-sm"
            >
              <span>
                <Link
                  href={`/app/leads/${a.leadId}`}
                  className="font-semibold text-ink hover:text-accent"
                >
                  {a.leadName}
                </Link>{' '}
                <span className="text-muted">
                  · attempt {a.attemptNumber} · {formatDateTime(a.createdAt)}
                </span>
              </span>
              <Badge
                tone={
                  a.status === 'DIALING' ? 'accent' : a.outcome === 'CONNECTED' ? 'live' : 'neutral'
                }
              >
                {a.status === 'DIALING'
                  ? 'On the call'
                  : a.outcome
                    ? OUTCOME_LABELS[a.outcome]
                    : '—'}
                {a.durationSeconds ? ` · ${a.durationSeconds}s` : ''}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function SettingsPanel({ campaign: c }: { readonly campaign: Campaign }) {
  const rows: [string, string][] = [
    [
      'Caller number',
      c.callerNumber ? `${formatPhone(c.callerNumber.phone)} (${c.callerNumber.series}xx)` : 'None',
    ],
    [
      'AI agent',
      c.agentVersion
        ? `${c.agentVersion.agentName} · version ${c.agentVersion.version}`
        : 'None — choose one before launch',
    ],
    ['Daily window', `${c.windowStart}–${c.windowEnd}, recipient time`],
    ['Starts', c.startsAt ? formatDateTime(c.startsAt) : 'At launch'],
    ['Ends', c.endsAt ? formatDateTime(c.endsAt) : 'When every lead is done'],
    ['Pacing', `${c.maxConcurrentCalls} at once, ${c.maxCallsPerHour} per hour`],
    [
      'Retries',
      `${c.maxAttempts} attempts, ${c.retryIntervalMinutes / 60} h apart, ${c.maxAttemptsPerDay} per day`,
    ],
    [
      'Selection',
      c.selection.statuses?.length ? `Statuses: ${c.selection.statuses.join(', ')}` : 'All leads',
    ],
  ];
  return (
    <Panel title="Settings">
      <dl className="grid gap-2 text-sm">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex justify-between gap-4 border-b border-line/60 pb-2 last:border-0 last:pb-0"
          >
            <dt className="text-muted">{label}</dt>
            <dd className="text-right font-semibold text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}
