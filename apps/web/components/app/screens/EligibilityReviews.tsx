'use client';

import Link from 'next/link';
import { useState } from 'react';
import { reasonLabel, type EligibilityReview, type Page } from '@/lib/api/types';
import { api } from '@/lib/app/api';
import { formatDateTime } from '@/lib/app/format';
import { useResource } from '@/lib/app/use-resource';
import { useSubmit } from '@/lib/app/use-submit';
import { EmptyState, ErrorBlock, Field, FormAlert, LoadingBlock, PageHeader, Panel } from '../ui';

/**
 * FR-50: decisions the engine could not make. Resolving supplies a fact or excludes the lead;
 * the lead is then checked again, so a review never overrides a blocking rule.
 */
export function EligibilityReviews() {
  const list = useResource<Page<EligibilityReview>>('/compliance/reviews?limit=100');
  return (
    <div className="grid gap-8">
      <div>
        <Link href="/app/compliance" className="text-sm font-semibold text-accent hover:underline">
          ← Compliance
        </Link>
        <div className="mt-3">
          <PageHeader
            title="Review queue"
            description="Leads the eligibility check could not decide. Resolving never overrides a blocking rule: the lead is checked again before any call."
          />
        </div>
      </div>
      {list.error && !list.data ? (
        <ErrorBlock message={list.error} onRetry={list.reload} />
      ) : !list.data ? (
        <LoadingBlock label="Loading the review queue" />
      ) : list.data.items.length === 0 ? (
        <Panel>
          <EmptyState icon="i-check-c" title="Nothing to review">
            Leads appear here when a campaign cannot decide whether calling them is allowed.
          </EmptyState>
        </Panel>
      ) : (
        list.data.items.map((item) => (
          <ReviewItem key={item.id} item={item} onResolved={list.reload} />
        ))
      )}
    </div>
  );
}

function ReviewItem({
  item,
  onResolved,
}: {
  readonly item: EligibilityReview;
  readonly onResolved: () => void;
}) {
  const submit = useSubmit();
  const [consentAt, setConsentAt] = useState('');
  const needsDate = item.reasons.some((r) => r.code === 'CONSENT_EVIDENCE_INCOMPLETE');
  const resolve = (body: Record<string, unknown>) =>
    void submit
      .run(() => api.post(`/compliance/reviews/${item.id}/resolve`, body))
      .then((ok) => {
        if (ok) onResolved();
      });
  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={`/app/leads/${item.leadId}`}
            className="text-lg font-semibold text-ink hover:text-accent"
          >
            {item.leadName}
          </Link>
          <p className="text-sm text-muted">
            <Link href={`/app/campaigns/${item.campaignId}`} className="hover:underline">
              {item.campaignName}
            </Link>{' '}
            · {formatDateTime(item.createdAt)}
          </p>
        </div>
      </div>
      <ul className="mt-3 grid gap-1 text-sm">
        {item.reasons.map((r) => (
          <li key={r.code} className="text-ink">
            <span className="font-semibold">{reasonLabel(r.code)}</span>
            <span className="text-muted"> — {r.message}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 grid gap-3">
        <FormAlert message={submit.error} />
        {needsDate ? (
          <form
            className="grid gap-3 sm:grid-cols-[minmax(12rem,16rem)_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              resolve({
                action: 'RECORD_CONSENT_DATE',
                consentAt: new Date(consentAt).toISOString(),
              });
            }}
          >
            <Field
              id={`consent-at-${item.id}`}
              label="Date the inquiry or consent was given"
              type="date"
              required
              value={consentAt}
              onChange={(e) => setConsentAt(e.target.value)}
            />
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={submit.pending || !consentAt}
            >
              Record date and re-check
            </button>
          </form>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={submit.pending}
            onClick={() => resolve({ action: 'RECHECK' })}
          >
            Re-check
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={submit.pending}
            onClick={() => resolve({ action: 'EXCLUDE' })}
          >
            Exclude from campaign
          </button>
        </div>
      </div>
    </Panel>
  );
}
