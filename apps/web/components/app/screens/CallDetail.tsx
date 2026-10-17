'use client';

import Link from 'next/link';
import type { CallSessionDetail } from '@/lib/api/types';
import { formatDateTime } from '@/lib/app/format';
import { useResource } from '@/lib/app/use-resource';
import { ErrorBlock, LoadingBlock, PageHeader, Panel } from '../ui';

function formatDuration(seconds: number): string {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function describeOutcome(telephony: string | null, conversation: string | null): string {
  if (conversation) return conversation.replaceAll('_', ' ').toLowerCase();
  if (telephony) return telephony.replaceAll('_', ' ').toLowerCase();
  return 'in progress';
}

export function CallDetail({ id }: { readonly id: string }) {
  const call = useResource<CallSessionDetail>(`/calls/${id}`);

  if (call.error && !call.data) {
    return (
      <div className="grid gap-6">
        <PageHeader title="Call" />
        <ErrorBlock message={call.error} onRetry={call.reload} />
      </div>
    );
  }
  if (!call.data) {
    return (
      <div className="grid gap-6">
        <PageHeader title="Call" />
        <LoadingBlock />
      </div>
    );
  }

  const row = call.data;
  const turns = row.transcript ?? [];
  return (
    <div className="grid gap-8">
      <PageHeader
        title={row.direction === 'INBOUND' ? 'Inbound call' : 'Outbound call'}
        description={`${row.fromE164} → ${row.toE164}`}
        actions={
          <Link href="/app/calls" className="btn btn-secondary btn-sm">
            Back to call history
          </Link>
        }
      />
      <Panel>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs tracking-[0.08em] text-muted uppercase">Started</dt>
            <dd className="mt-1 text-sm text-ink">{formatDateTime(row.startedAt)}</dd>
          </div>
          <div>
            <dt className="text-xs tracking-[0.08em] text-muted uppercase">Ended</dt>
            <dd className="mt-1 text-sm text-ink">
              {row.endedAt ? formatDateTime(row.endedAt) : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs tracking-[0.08em] text-muted uppercase">Duration</dt>
            <dd className="mt-1 text-sm text-ink">{formatDuration(row.durationSeconds)}</dd>
          </div>
          <div>
            <dt className="text-xs tracking-[0.08em] text-muted uppercase">Outcome</dt>
            <dd className="mt-1 text-sm text-ink">
              {describeOutcome(row.telephonyOutcome, row.conversationOutcome)}
            </dd>
          </div>
        </dl>
      </Panel>
      <Panel>
        <h2 className="text-sm font-bold tracking-[0.08em] text-muted uppercase">Transcript</h2>
        {turns.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            No turns recorded. If the call entered the AI loop, the first webhook may not have
            persisted yet or the caller hung up before speaking.
          </p>
        ) : (
          <ol className="mt-4 grid gap-3">
            {turns.map((turn, index) => (
              <li
                key={`${turn.role}-${index}`}
                className={`rounded-md border p-3 text-sm ${
                  turn.role === 'agent'
                    ? 'border-line bg-surface'
                    : 'border-line/60 bg-surface/60'
                }`}
              >
                <div className="text-xs tracking-[0.08em] text-muted uppercase">
                  {turn.role === 'agent' ? 'Agent' : 'Caller'}
                </div>
                <div className="mt-1 whitespace-pre-wrap text-ink">
                  {turn.text || <span className="text-muted italic">(silent)</span>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Panel>
      <Panel>
        <h2 className="text-sm font-bold tracking-[0.08em] text-muted uppercase">Usage</h2>
        <dl className="mt-3 grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs tracking-[0.08em] text-muted uppercase">LLM input tokens</dt>
            <dd className="mt-1 text-sm text-ink">{row.usage.inputTokens.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-xs tracking-[0.08em] text-muted uppercase">LLM output tokens</dt>
            <dd className="mt-1 text-sm text-ink">{row.usage.outputTokens.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-xs tracking-[0.08em] text-muted uppercase">STT audio seconds</dt>
            <dd className="mt-1 text-sm text-ink">{row.usage.audioSeconds.toFixed(2)}</dd>
          </div>
        </dl>
      </Panel>
    </div>
  );
}
