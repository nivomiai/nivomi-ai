'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  ELIGIBILITY_LABELS,
  LEAD_STATUS_LABELS,
  OUTCOME_LABELS,
  reasonLabel,
  type CallQueueItem,
  type EligibilityResult,
} from '@/lib/api/types';
import { QUEUE_FILTERS, type QueueFilter } from '@/lib/app/call-queue';
import { formatDateTime, formatPhone } from '@/lib/app/format';
import { useSession } from '@/lib/app/session';
import { useResource } from '@/lib/app/use-resource';
import { cx } from '@/lib/site/cx';
import { Badge, EmptyState, ErrorBlock, LoadingBlock, Notice, PageHeader, Panel } from '../ui';

const FILTER_LABELS: Record<QueueFilter, string> = {
  upcoming: 'Up next',
  review: 'Needs review',
  blocked: 'Blocked',
  all: 'Everything',
};

const RESULT_TONE: Record<EligibilityResult, 'live' | 'warn' | 'neutral' | 'accent'> = {
  ELIGIBLE: 'live',
  DEFERRED: 'neutral',
  REQUIRES_REVIEW: 'accent',
  BLOCKED: 'warn',
};

/** "Every row explains why a call will or will not happen" (MVP call queue). */
export function CallQueue({ initialFilter }: { readonly initialFilter: QueueFilter }) {
  const { can } = useSession();
  const [filter, setFilter] = useState<QueueFilter>(initialFilter);
  const queue = useResource<{ items: CallQueueItem[]; truncated: boolean }>(
    `/call-queue?filter=${filter}`,
    { pollWhile: () => true, pollMs: 5_000 },
  );

  const priority = (item: CallQueueItem): string => {
    if (item.state === 'IN_CALL' || item.state === 'QUEUED') return 'P1';
    if (item.state === 'PENDING') return 'P2';
    if (item.state === 'WAITING') return 'P3';
    return '—';
  };
  const nextAction = (item: CallQueueItem) => {
    switch (item.state) {
      case 'IN_CALL':
        return 'On a call now';
      case 'QUEUED':
        return 'Dialling shortly';
      case 'PENDING':
        return item.nextAttemptAt && new Date(item.nextAttemptAt) > new Date()
          ? `Calls ${formatDateTime(item.nextAttemptAt)}`
          : 'Up next';
      case 'WAITING':
        return item.nextAttemptAt ? `Next try ${formatDateTime(item.nextAttemptAt)}` : 'Waiting';
      case 'REVIEW':
        return can('compliance.review') ? (
          <Link
            href="/app/compliance/reviews"
            className="font-semibold text-accent hover:underline"
          >
            Review
          </Link>
        ) : (
          'Waiting for an admin'
        );
      case 'BLOCKED':
        return 'Will not be called';
      default:
        return '—';
    }
  };

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Call queue"
        description="Every lead in running, scheduled or paused campaigns — and why it will or will not be called. Eligibility is checked again right before each dial."
      />
      <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
        {QUEUE_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={cx(
              'rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors',
              filter === f
                ? 'border-accent-tint bg-accent-soft text-accent'
                : 'border-line text-ink-2 hover:text-ink',
            )}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
      </div>
      <Panel>
        {queue.error && !queue.data ? (
          <ErrorBlock message={queue.error} onRetry={queue.reload} />
        ) : !queue.data ? (
          <LoadingBlock label="Loading the call queue" />
        ) : queue.data.items.length === 0 ? (
          <EmptyState icon="i-repeat" title="Nothing here">
            Leads appear once a campaign is running, scheduled or paused.
          </EmptyState>
        ) : (
          <div className="grid gap-4">
            {queue.data.truncated ? (
              <Notice tone="info">
                Showing the first 200 by priority. Campaign pages list every lead.
              </Notice>
            ) : null}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs tracking-[0.08em] text-muted uppercase">
                  <tr>
                    <th className="py-2 pr-3 font-bold">Priority</th>
                    <th className="py-2 pr-3 font-bold">Customer</th>
                    <th className="py-2 pr-3 font-bold">Lead status</th>
                    <th className="py-2 pr-3 font-bold">Eligibility</th>
                    <th className="py-2 pr-3 font-bold">Reason</th>
                    <th className="py-2 pr-3 font-bold">Next action</th>
                    <th className="py-2 font-bold">Campaign</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.data.items.map((item) => (
                    <tr key={item.id} className="border-t border-line align-top">
                      <td className="py-3 pr-3 font-semibold text-ink">{priority(item)}</td>
                      <td className="py-3 pr-3">
                        <Link
                          href={`/app/leads/${item.leadId}`}
                          className="font-semibold text-ink hover:text-accent"
                        >
                          {item.fullName}
                        </Link>
                        <p className="text-[13px] text-muted">{formatPhone(item.phone)}</p>
                      </td>
                      <td className="py-3 pr-3 text-ink-2">
                        {LEAD_STATUS_LABELS[item.leadStatus]}
                      </td>
                      <td className="py-3 pr-3">
                        {item.lastResult ? (
                          <Badge tone={RESULT_TONE[item.lastResult]}>
                            {ELIGIBILITY_LABELS[item.lastResult]}
                          </Badge>
                        ) : (
                          <span className="text-muted">Not checked yet</span>
                        )}
                      </td>
                      <td className="py-3 pr-3 text-ink-2">
                        {item.lastOutcome
                          ? `Last call: ${OUTCOME_LABELS[item.lastOutcome]}`
                          : item.lastReasons.map(reasonLabel).join(', ') || '—'}
                      </td>
                      <td className="py-3 pr-3 text-ink-2">{nextAction(item)}</td>
                      <td className="py-3">
                        <Link
                          href={`/app/campaigns/${item.campaignId}`}
                          className="text-accent hover:underline"
                        >
                          {item.campaignName}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
