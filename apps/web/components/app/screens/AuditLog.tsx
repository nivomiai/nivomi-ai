'use client';

import { useEffect, useState } from 'react';
import { errorMessage } from '@/lib/api/client';
import type { AuditItem, Member, Page } from '@/lib/api/types';
import { api } from '@/lib/app/api';
import { describeAuditAction, formatDateTime } from '@/lib/app/format';
import { useResource } from '@/lib/app/use-resource';
import { EmptyState, ErrorBlock, LoadingBlock, PageHeader, Panel } from '../ui';

const PAGE_SIZE = 50;

export function AuditLog() {
  const [items, setItems] = useState<AuditItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const members = useResource<Page<Member>>('/organizations/current/members');

  const load = async (after: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (after) query.set('cursor', after);
      const page = await api.get<Page<AuditItem>>(`/organizations/current/audit-logs?${query}`);
      setItems((previous) => (after ? [...previous, ...page.items] : page.items));
      setCursor(page.nextCursor ?? null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(null);
  }, []);

  const actorName = (userId: string | null) =>
    members.data?.items.find((m) => m.userId === userId)?.name ??
    (userId ? 'Former member' : 'System');

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Audit log"
        description="Security and administrative activity in this organization, newest first."
      />
      <Panel>
        {error ? <ErrorBlock message={error} onRetry={() => void load(cursor)} /> : null}
        {items.length === 0 && loading ? <LoadingBlock /> : null}
        {items.length === 0 && !loading && !error ? (
          <EmptyState icon="i-shield" title="No activity yet" />
        ) : null}
        {items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs tracking-[0.08em] text-muted uppercase">
                  <th scope="col" className="py-3 pr-4 font-bold">
                    When
                  </th>
                  <th scope="col" className="py-3 pr-4 font-bold">
                    Who
                  </th>
                  <th scope="col" className="py-3 pr-4 font-bold">
                    What
                  </th>
                  <th scope="col" className="py-3 font-bold">
                    IP address
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-3 pr-4 whitespace-nowrap text-muted">
                      {formatDateTime(item.createdAt)}
                    </td>
                    <td className="py-3 pr-4 font-semibold text-ink">
                      {actorName(item.actorUserId)}
                    </td>
                    <td className="py-3 pr-4 text-ink-2">{describeAuditAction(item.action)}</td>
                    <td className="py-3 font-mono text-xs text-muted">{item.ipAddress ?? '—'}</td>
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
            onClick={() => void load(cursor)}
          >
            {loading ? 'Loading…' : 'Load more'}
          </button>
        ) : null}
      </Panel>
    </div>
  );
}
