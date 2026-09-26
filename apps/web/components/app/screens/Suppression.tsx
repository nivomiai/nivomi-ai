'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import type { Page, SuppressionEntry } from '@/lib/api/types';
import { api } from '@/lib/app/api';
import { formatDateTime, formatPhone } from '@/lib/app/format';
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

const SOURCE: Record<SuppressionEntry['source'], string> = {
  MANUAL: 'Added by a member',
  IMPORT: 'From an import',
  IN_CALL_OPT_OUT: 'Opted out on a call',
  HUBSPOT: 'From HubSpot',
};

/** PRD FR-22: numbers Nivomi must never call. */
export function Suppression() {
  const { can } = useSession();
  const list = useResource<Page<SuppressionEntry>>('/suppression?limit=100');
  const [phone, setPhone] = useState('');
  const [reason, setReason] = useState('');
  const [added, setAdded] = useState<string | null>(null);
  const add = useSubmit();
  const remove = useSubmit();

  const onAdd = async (event: FormEvent) => {
    event.preventDefault();
    setAdded(null);
    const ok = await add.run(() => api.post('/suppression', { phone, reason: reason || null }));
    if (ok) {
      setAdded(phone);
      setPhone('');
      setReason('');
      list.reload();
    }
  };

  return (
    <div className="grid gap-8">
      <div>
        <Link href="/app/leads" className="text-sm font-semibold text-accent hover:underline">
          ← All leads
        </Link>
        <div className="mt-3">
          <PageHeader
            title="Suppression list"
            description="Numbers here are never called, whatever their lead status or consent."
          />
        </div>
      </div>
      {can('suppression.manage') ? (
        <Panel title="Add a number">
          <form
            onSubmit={(e) => void onAdd(e)}
            className="grid gap-4 sm:grid-cols-[1fr_1.5fr_auto] sm:items-end"
          >
            <div className="sm:col-span-3">
              <FormAlert message={add.error} />
              {added ? <Notice tone="success">{added} will not be called.</Notice> : null}
            </div>
            <Field
              id="suppress-phone"
              label="Phone"
              required
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <Field
              id="suppress-reason"
              label="Reason (optional)"
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <button type="submit" className="btn btn-primary" disabled={add.pending}>
              {add.pending ? 'Adding…' : 'Add'}
            </button>
          </form>
        </Panel>
      ) : null}
      <Panel>
        <FormAlert message={remove.error} />
        {list.error ? <ErrorBlock message={list.error} onRetry={list.reload} /> : null}
        {!list.data && !list.error ? <LoadingBlock /> : null}
        {list.data && list.data.items.length === 0 ? (
          <EmptyState icon="i-shield" title="No suppressed numbers" />
        ) : null}
        {list.data && list.data.items.length > 0 ? (
          <ul className="divide-y divide-line rounded-[14px] border border-line">
            {list.data.items.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">{formatPhone(entry.phone)}</p>
                  <p className="text-sm text-muted">
                    {formatDateTime(entry.createdAt)}
                    {entry.reason ? ` · ${entry.reason}` : ''}
                  </p>
                </div>
                <Badge
                  tone={entry.source === 'MANUAL' || entry.source === 'IMPORT' ? 'neutral' : 'warn'}
                >
                  {SOURCE[entry.source]}
                </Badge>
                {can('suppression.manage') &&
                (entry.source === 'MANUAL' || entry.source === 'IMPORT') ? (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={remove.pending}
                    onClick={() => {
                      if (!window.confirm(`Allow ${entry.phone} to be called again?`)) return;
                      void remove
                        .run(() => api.del(`/suppression/${entry.id}`))
                        .then((ok) => ok && list.reload());
                    }}
                  >
                    Remove
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>
    </div>
  );
}
