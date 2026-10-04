'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  CALL_CATEGORY_LABELS,
  CAMPAIGN_STATUS_LABELS,
  PAUSE_REASON_LABELS,
  type CallingControls,
  type CampaignListItem,
  type CampaignStatus,
  type Page,
  type RuleSetSummary,
} from '@/lib/api/types';
import { api } from '@/lib/app/api';
import { formatDateTime, formatNumber } from '@/lib/app/format';
import { useSession } from '@/lib/app/session';
import { useResource } from '@/lib/app/use-resource';
import { useSubmit } from '@/lib/app/use-submit';
import {
  Badge,
  EmptyState,
  ErrorBlock,
  Field,
  FormAlert,
  LoadingBlock,
  Notice,
  PageHeader,
  Panel,
} from '../ui';

export function campaignTone(status: CampaignStatus): 'neutral' | 'accent' | 'live' | 'warn' {
  if (status === 'RUNNING') return 'live';
  if (status === 'PAUSED' || status === 'STOPPED') return 'warn';
  if (status === 'SCHEDULED') return 'accent';
  return 'neutral';
}

export function CampaignStatusBadge({
  status,
  pauseReason,
}: {
  readonly status: CampaignStatus;
  readonly pauseReason?: string | null;
}) {
  return (
    <Badge tone={campaignTone(status)}>
      {CAMPAIGN_STATUS_LABELS[status]}
      {status === 'PAUSED' && pauseReason
        ? ` · ${PAUSE_REASON_LABELS[pauseReason] ?? pauseReason}`
        : ''}
    </Badge>
  );
}

/** The India rules are drafts until counsel reviews them; every calling screen says so. */
export function RuleSetNotice() {
  const ruleSets = useResource<{ items: RuleSetSummary[] }>('/compliance/rule-sets');
  const pending = ruleSets.data?.items.filter((r) => r.pendingLegalReview) ?? [];
  if (pending.length === 0) return null;
  return (
    <Notice tone="warn">
      Calling rules {pending.map((r) => `${r.jurisdiction} v${r.version}`).join(', ')} are a{' '}
      <strong>draft pending legal review</strong>. They block anything unknown, and the dialer is
      simulated until telephony is connected.{' '}
      <Link href="/app/compliance" className="font-semibold underline underline-offset-4">
        See the rules
      </Link>
    </Notice>
  );
}

export function Campaigns() {
  const { can } = useSession();
  const list = useResource<Page<CampaignListItem>>('/campaigns?limit=50');
  const controls = useResource<CallingControls>(
    can('compliance.read') ? '/compliance/controls' : null,
  );

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Campaigns"
        description="Every call passes the eligibility check twice: before launch and again right before dialling."
        actions={
          can('campaigns.manage') ? (
            <Link href="/app/campaigns/new" className="btn btn-primary btn-sm">
              New campaign
            </Link>
          ) : null
        }
      />
      <RuleSetNotice />
      {can('campaigns.emergency_stop') ? (
        <EmergencyStop
          controls={controls.data}
          onChange={() => {
            controls.reload();
            list.reload();
          }}
        />
      ) : controls.data?.emergencyStop.active ? (
        <Notice tone="warn">Emergency Stop is on: nothing is being dialled.</Notice>
      ) : null}
      {controls.data?.breaker.tripped ? (
        <Notice tone="warn">
          The complaint breaker has paused all calling ({controls.data.breaker.reason}).{' '}
          <Link href="/app/compliance" className="font-semibold underline underline-offset-4">
            Review complaints
          </Link>
        </Notice>
      ) : null}

      <Panel>
        {list.error && !list.data ? (
          <ErrorBlock message={list.error} onRetry={list.reload} />
        ) : !list.data ? (
          <LoadingBlock label="Loading campaigns" />
        ) : list.data.items.length === 0 ? (
          <EmptyState icon="i-phone" title="No campaigns yet">
            Create one from your leads. It stays a draft until the pre-launch check passes.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs tracking-[0.08em] text-muted uppercase">
                <tr>
                  <th className="py-2 pr-4 font-bold">Campaign</th>
                  <th className="py-2 pr-4 font-bold">Status</th>
                  <th className="py-2 pr-4 font-bold">Type</th>
                  <th className="py-2 pr-4 font-bold">Minutes used</th>
                  <th className="py-2 font-bold">Created</th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((c) => (
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
                    <td className="py-3 pr-4 text-ink-2">
                      {CALL_CATEGORY_LABELS[c.callCategory]} ·{' '}
                      {c.type === 'CONTINUOUS' ? 'Continuous' : 'Fixed list'}
                    </td>
                    <td className="py-3 pr-4 text-ink-2">
                      {formatNumber(Math.ceil(c.usedSeconds / 60))} /{' '}
                      {formatNumber(c.budgetMinutes)}
                    </td>
                    <td className="py-3 text-ink-2">{formatDateTime(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

/** FR-43: stop all dialling for the organization; resuming is explicit, per campaign. */
function EmergencyStop({
  controls,
  onChange,
}: {
  readonly controls: CallingControls | undefined;
  readonly onChange: () => void;
}) {
  const submit = useSubmit();
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const active = controls?.emergencyStop.active === true;

  if (active) {
    return (
      <section
        aria-labelledby="emergency-heading"
        className="rounded-[16px] border border-warn/30 bg-warn-soft p-5"
      >
        <h2 id="emergency-heading" className="text-lg font-bold text-warn">
          Emergency Stop is on
        </h2>
        <p className="mt-1 text-sm text-warn">
          Nothing is dialled for this organization
          {controls.emergencyStop.at ? ` since ${formatDateTime(controls.emergencyStop.at)}` : ''}
          {controls.emergencyStop.reason ? ` — ${controls.emergencyStop.reason}` : ''}. Releasing it
          does not restart any campaign; resume each one yourself.
        </p>
        <FormAlert message={submit.error} />
        <button
          type="button"
          className="btn btn-secondary btn-sm mt-4"
          disabled={submit.pending}
          onClick={() =>
            void submit
              .run(() => api.del('/campaigns/emergency-stop'))
              .then((ok) => {
                if (ok) onChange();
              })
          }
        >
          {submit.pending ? 'Releasing…' : 'Release Emergency Stop'}
        </button>
      </section>
    );
  }

  return (
    <section className="flex flex-wrap items-end justify-between gap-4 rounded-[16px] border border-line bg-card p-5">
      <div className="max-w-xl">
        <h2 className="text-lg tracking-[-0.02em] text-ink">Emergency Stop</h2>
        <p className="mt-1 text-sm text-muted">
          Stops all dialling for the organization at once and pauses every running campaign.
        </p>
      </div>
      {confirming ? (
        <form
          className="grid w-full gap-3 sm:w-auto sm:grid-cols-[minmax(14rem,1fr)_auto_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void submit
              .run(() => api.post('/campaigns/emergency-stop', { reason: reason || null }))
              .then((ok) => {
                if (ok) {
                  setConfirming(false);
                  setReason('');
                  onChange();
                }
              });
          }}
        >
          <div className="sm:col-span-3">
            <FormAlert message={submit.error} />
          </div>
          <Field
            id="stop-reason"
            label="Reason (optional)"
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={submit.pending}>
            {submit.pending ? 'Stopping…' : 'Stop all calling'}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setConfirming(false)}
          >
            Cancel
          </button>
        </form>
      ) : (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setConfirming(true)}
        >
          Emergency Stop
        </button>
      )}
    </section>
  );
}
