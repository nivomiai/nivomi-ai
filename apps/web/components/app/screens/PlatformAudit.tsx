'use client';

import { useEffect, useState } from 'react';
import { errorMessage } from '@/lib/api/client';
import type { Page, PlatformAuditItem } from '@/lib/api/types';
import { api } from '@/lib/app/api';
import { describeAuditAction, formatDateTime } from '@/lib/app/format';
import { useSession } from '@/lib/app/session';
import { EmptyState, ErrorBlock, LoadingBlock, PageHeader, Panel } from '../ui';

const PAGE_SIZE = 50;

/** Cross-tenant audit log for Super Admin (FR-120). Actions from every org, newest first. */
export function PlatformAudit() {
  const { me } = useSession();
  const [items, setItems] = useState<PlatformAuditItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async (after: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (after) query.set('cursor', after);
      const page = await api.get<Page<PlatformAuditItem>>(`/platform/audit-logs?${query}`);
      setItems((previous) => (after ? [...previous, ...page.items] : page.items));
      setCursor(page.nextCursor ?? null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Loads once on mount; explicit reload replaces the list.
    void load(null);
  }, []);

  if (!me?.user.isSuperAdmin) {
    return (
      <div className="grid gap-8">
        <PageHeader title="Platform audit" />
        <EmptyState icon="i-shield" title="Super Admin only">
          <p>Only a platform Super Admin may open this section.</p>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Platform audit"
        description="Every audited action across every organization, newest first."
      />
      <Panel>
        {error ? (
          <ErrorBlock message={error} onRetry={() => void load(null)} />
        ) : loading && items.length === 0 ? (
          <LoadingBlock label="Loading audit log" />
        ) : items.length === 0 ? (
          <EmptyState icon="i-shield" title="No entries yet">
            <p>Actions will appear here as Super Admins and members use the platform.</p>
          </EmptyState>
        ) : (
          <ul className="grid gap-2">
            {items.map((entry) => (
              <li key={entry.id} className="rounded-[12px] border border-line bg-card p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <p className="text-[15px] font-semibold text-ink">
                    {describeAuditAction(entry.action)}
                  </p>
                  <time className="text-[12.5px] text-muted">
                    {formatDateTime(entry.createdAt)}
                  </time>
                </div>
                <p className="mt-1 text-[13px] text-muted">
                  {entry.organizationId ? (
                    <>
                      Organization <code className="text-ink-2">{entry.organizationId}</code>
                    </>
                  ) : (
                    'Platform-wide'
                  )}
                </p>
                {entry.metadata ? (
                  <pre className="mt-2 overflow-x-auto rounded-[8px] bg-soft p-2 font-mono text-[11.5px] text-ink-2">
                    {JSON.stringify(entry.metadata, null, 2)}
                  </pre>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {cursor ? (
          <button
            type="button"
            onClick={() => void load(cursor)}
            className="btn btn-secondary btn-sm mt-4"
            disabled={loading}
          >
            {loading ? 'Loading…' : 'Load older'}
          </button>
        ) : null}
      </Panel>
    </div>
  );
}
