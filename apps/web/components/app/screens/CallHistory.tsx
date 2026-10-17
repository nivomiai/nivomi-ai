'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { errorMessage } from '@/lib/api/client';
import type { Page } from '@/lib/api/types';
import { api } from '@/lib/app/api';
import { formatDateTime } from '@/lib/app/format';
import { EmptyState, ErrorBlock, LoadingBlock, PageHeader, Panel } from '../ui';

interface CallRow {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  fromE164: string;
  toE164: string;
  startedAt: string;
  durationSeconds: number;
  telephonyOutcome: string | null;
  conversationOutcome: string | null;
}

const PAGE_SIZE = 50;
type Filter = 'ALL' | 'INBOUND' | 'OUTBOUND';

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

export function CallHistory() {
  const [items, setItems] = useState<CallRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('ALL');

  const load = async (after: string | null, direction: Filter) => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (after) query.set('cursor', after);
      if (direction !== 'ALL') query.set('direction', direction);
      const page = await api.get<Page<CallRow>>(`/calls?${query}`);
      setItems((previous) => (after ? [...previous, ...page.items] : page.items));
      setCursor(page.nextCursor ?? null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(null, filter);
  }, [filter]);

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Call history"
        description="Every call this organization sent or received, newest first. Inbound rows arrive from the Exotel Flow webhook; outbound rows come from the campaign runner."
      />
      <Panel>
        <div className="mb-4 flex gap-2">
          {(['ALL', 'INBOUND', 'OUTBOUND'] as Filter[]).map((f) => (
            <button
              type="button"
              key={f}
              className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilter(f)}
            >
              {f === 'ALL' ? 'All' : f === 'INBOUND' ? 'Inbound' : 'Outbound'}
            </button>
          ))}
        </div>
        {error ? <ErrorBlock message={error} onRetry={() => void load(cursor, filter)} /> : null}
        {items.length === 0 && loading ? <LoadingBlock /> : null}
        {items.length === 0 && !loading && !error ? (
          <EmptyState icon="i-phone" title="No calls yet">
            Once a caller dials one of your ExoPhones, their call lands here.
          </EmptyState>
        ) : null}
        {items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs tracking-[0.08em] text-muted uppercase">
                  <th scope="col" className="py-3 pr-4 font-bold">
                    When
                  </th>
                  <th scope="col" className="py-3 pr-4 font-bold">
                    Direction
                  </th>
                  <th scope="col" className="py-3 pr-4 font-bold">
                    From
                  </th>
                  <th scope="col" className="py-3 pr-4 font-bold">
                    To
                  </th>
                  <th scope="col" className="py-3 pr-4 font-bold">
                    Duration
                  </th>
                  <th scope="col" className="py-3 font-bold">
                    Outcome
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-surface/40">
                    <td className="py-3 pr-4 whitespace-nowrap text-muted">
                      <Link href={`/app/calls/${item.id}`} className="hover:text-ink">
                        {formatDateTime(item.startedAt)}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 font-semibold text-ink">
                      <Link href={`/app/calls/${item.id}`} className="hover:underline">
                        {item.direction === 'INBOUND' ? 'Inbound' : 'Outbound'}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs text-ink-2">{item.fromE164}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-ink-2">{item.toE164}</td>
                    <td className="py-3 pr-4 text-ink-2">
                      {formatDuration(item.durationSeconds)}
                    </td>
                    <td className="py-3 text-ink-2">
                      {describeOutcome(item.telephonyOutcome, item.conversationOutcome)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {cursor ? (
          <button
            type="button"
            className="btn btn-secondary btn-sm mt-5"
            disabled={loading}
            onClick={() => void load(cursor, filter)}
          >
            {loading ? 'Loading…' : 'Load more'}
          </button>
        ) : null}
      </Panel>
    </div>
  );
}
