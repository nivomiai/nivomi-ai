'use client';

import Link from 'next/link';
import type { Page, ReviewItem } from '@/lib/api/types';
import { api } from '@/lib/app/api';
import { formatDateTime, formatPhone } from '@/lib/app/format';
import { useResource } from '@/lib/app/use-resource';
import { useSubmit } from '@/lib/app/use-submit';
import { Badge, EmptyState, ErrorBlock, FormAlert, LoadingBlock, PageHeader, Panel } from '../ui';

/** PRD FR-17: uncertain matches are never merged automatically; a Member decides. */
export function ReviewQueue() {
  const reviews = useResource<Page<ReviewItem>>('/ingestion/reviews?limit=50');
  const submit = useSubmit();

  const resolve = (id: string, body: { action: string; contactId?: string }) =>
    void submit
      .run(() => api.post(`/ingestion/reviews/${id}/resolve`, body))
      .then((ok) => ok && reviews.reload());

  return (
    <div className="grid gap-8">
      <div>
        <Link
          href="/app/data-sources"
          className="text-sm font-semibold text-accent hover:underline"
        >
          ← Data sources
        </Link>
        <div className="mt-3">
          <PageHeader
            title="Possible duplicates"
            description="These records matched an existing contact only partly. Choose what happens to each."
          />
        </div>
      </div>
      <FormAlert message={submit.error} />
      {reviews.error ? <ErrorBlock message={reviews.error} onRetry={reviews.reload} /> : null}
      {!reviews.data && !reviews.error ? <LoadingBlock /> : null}
      {reviews.data && reviews.data.items.length === 0 ? (
        <EmptyState icon="i-check-c" title="Nothing to review" />
      ) : null}
      {reviews.data?.items.map((item) => (
        <Panel key={item.id}>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="warn">
              {item.source === 'HUBSPOT' ? 'From HubSpot' : 'From an import'}
            </Badge>
            <span className="text-sm text-muted">{formatDateTime(item.createdAt)}</span>
          </div>
          <p className="mt-3 text-sm text-ink">{item.reason}</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-[12px] border border-line p-4">
              <p className="text-xs font-bold tracking-[0.08em] text-muted uppercase">Incoming</p>
              <p className="mt-1 font-semibold text-ink">{item.record.fullName ?? '—'}</p>
              <p className="text-sm text-ink-2">{formatPhone(item.record.phoneE164 ?? null)}</p>
              {item.record.emailNormalized ? (
                <p className="text-sm text-ink-2">{item.record.emailNormalized}</p>
              ) : null}
              <button
                type="button"
                className="btn btn-secondary btn-sm mt-3"
                disabled={submit.pending}
                onClick={() => resolve(item.id, { action: 'CREATE_NEW' })}
              >
                Keep as a new contact
              </button>
            </div>
            <div className="grid gap-3">
              {item.candidates.map((candidate) => (
                <div key={candidate.id} className="rounded-[12px] border border-line p-4">
                  <p className="text-xs font-bold tracking-[0.08em] text-muted uppercase">
                    Existing
                  </p>
                  <p className="mt-1 font-semibold text-ink">{candidate.fullName}</p>
                  <p className="text-sm text-ink-2">{formatPhone(candidate.phone)}</p>
                  {candidate.email ? <p className="text-sm text-ink-2">{candidate.email}</p> : null}
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm mt-3"
                    disabled={submit.pending}
                    onClick={() => resolve(item.id, { action: 'MERGE', contactId: candidate.id })}
                  >
                    Same person — add to this contact
                  </button>
                </div>
              ))}
            </div>
          </div>
          <button
            type="button"
            className="mt-4 text-sm font-semibold text-muted hover:text-accent"
            disabled={submit.pending}
            onClick={() => resolve(item.id, { action: 'DISCARD' })}
          >
            Discard the incoming record
          </button>
        </Panel>
      ))}
    </div>
  );
}
