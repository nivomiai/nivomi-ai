'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { errorMessage } from '@/lib/api/client';
import {
  CONSENT_LABELS,
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  SOURCE_LABELS,
  type LeadListItem,
  type LeadStatus,
  type Page,
} from '@/lib/api/types';
import { api } from '@/lib/app/api';
import { formatPhone } from '@/lib/app/format';
import { useSession } from '@/lib/app/session';
import { Badge, EmptyState, ErrorBlock, LoadingBlock, PageHeader, Panel, SelectField } from '../ui';

const PAGE_SIZE = 25;

export function statusTone(status: LeadStatus): 'neutral' | 'accent' | 'live' | 'warn' {
  if (['QUALIFIED', 'APPOINTMENT_BOOKED', 'CONVERTED', 'INTERESTED'].includes(status))
    return 'live';
  if (['DO_NOT_CALL', 'NOT_INTERESTED', 'UNREACHABLE', 'CLOSED'].includes(status)) return 'warn';
  if (status === 'NEW') return 'accent';
  return 'neutral';
}

interface Filters {
  search: string;
  status: string;
  consent: string;
  source: string;
}

function leadsQuery(filters: Filters, after: string | null): string {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  for (const key of ['search', 'status', 'consent', 'source'] as const) {
    if (filters[key]) params.set(key, filters[key]);
  }
  if (after) params.set('cursor', after);
  return `/leads?${params.toString()}`;
}

export function Leads() {
  const { can } = useSession();
  const [filters, setFilters] = useState<Filters>({
    search: '',
    status: '',
    consent: '',
    source: '',
  });
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<LeadListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounce typing into the search box.
  useEffect(() => {
    const timer = setTimeout(() => setFilters((f) => ({ ...f, search: search.trim() })), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api
      .get<Page<LeadListItem>>(leadsQuery(filters, null), controller.signal)
      .then((page) => {
        setItems(page.items);
        setCursor(page.nextCursor ?? null);
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [filters]);

  const loadMore = async () => {
    if (!cursor) return;
    setLoading(true);
    try {
      const page = await api.get<Page<LeadListItem>>(leadsQuery(filters, cursor));
      setItems((previous) => [...previous, ...page.items]);
      setCursor(page.nextCursor ?? null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const filtered = Object.values(filters).some(Boolean);

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Leads"
        description="Everyone you can reach, from files and manual entry — one record each."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/app/leads/suppression" className="btn btn-secondary btn-sm">
              Suppression list
            </Link>
            {can('leads.write') ? (
              <Link href="/app/leads/new" className="btn btn-primary btn-sm">
                Add lead
              </Link>
            ) : null}
          </div>
        }
      />
      <Panel>
        <div className="grid gap-4 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <label htmlFor="lead-search" className="text-sm font-semibold text-ink">
              Search
            </label>
            <input
              id="lead-search"
              type="search"
              placeholder="Name, email or phone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="mt-1.5 w-full rounded-[12px] border border-line bg-surface px-4 py-3 text-[15px] text-ink placeholder:text-muted/70 focus:border-pink focus:outline-none focus-visible:ring-4 focus-visible:ring-accent-tint"
            />
          </div>
          <SelectField
            id="lead-status"
            label="Status"
            value={filters.status}
            onChange={(status) => setFilters((f) => ({ ...f, status }))}
            options={[
              { value: '', label: 'Any status' },
              ...LEAD_STATUSES.map((s) => ({ value: s, label: LEAD_STATUS_LABELS[s] })),
            ]}
          />
          <SelectField
            id="lead-consent"
            label="Consent"
            value={filters.consent}
            onChange={(consent) => setFilters((f) => ({ ...f, consent }))}
            options={[
              { value: '', label: 'Any' },
              { value: 'with_basis', label: 'Has a consent basis' },
              { value: 'missing', label: 'No consent basis' },
            ]}
          />
          <SelectField
            id="lead-source"
            label="Source"
            value={filters.source}
            onChange={(source) => setFilters((f) => ({ ...f, source }))}
            options={[
              { value: '', label: 'Any source' },
              { value: 'FILE_IMPORT', label: 'File import' },
              { value: 'MANUAL', label: 'Manual' },
            ]}
          />
        </div>

        <div className="mt-6">
          {error ? <ErrorBlock message={error} /> : null}
          {!error && items.length === 0 && loading ? <LoadingBlock label="Loading leads" /> : null}
          {!error && items.length === 0 && !loading ? (
            <EmptyState
              icon="i-users"
              title={filtered ? 'No leads match these filters' : 'No leads yet'}
            >
              {filtered ? null : (
                <>
                  Import a CSV or Excel file from{' '}
                  <Link
                    href="/app/data-sources"
                    className="font-semibold text-accent hover:underline"
                  >
                    Data sources
                  </Link>
                  , or add a lead by hand.
                </>
              )}
            </EmptyState>
          ) : null}
          {items.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs tracking-[0.08em] text-muted uppercase">
                    <th scope="col" className="py-3 pr-4 font-bold">
                      Name
                    </th>
                    <th scope="col" className="py-3 pr-4 font-bold">
                      Phone
                    </th>
                    <th scope="col" className="py-3 pr-4 font-bold">
                      Status
                    </th>
                    <th scope="col" className="py-3 pr-4 font-bold">
                      Consent
                    </th>
                    <th scope="col" className="py-3 font-bold">
                      Source
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {items.map((lead) => (
                    <tr key={lead.id} className="align-top">
                      <td className="py-3 pr-4">
                        <Link
                          href={`/app/leads/${lead.id}`}
                          className="font-semibold text-ink hover:text-accent hover:underline"
                        >
                          {lead.fullName}
                        </Link>
                        <p className="text-[13px] text-muted">
                          {[lead.company, lead.email].filter(Boolean).join(' · ') || '—'}
                        </p>
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap text-ink-2">
                        {formatPhone(lead.phone)}
                        {lead.suppressed ? (
                          <span className="ml-2">
                            <Badge tone="warn">Suppressed</Badge>
                          </span>
                        ) : null}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge tone={statusTone(lead.status)}>
                          {LEAD_STATUS_LABELS[lead.status]}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4">
                        {lead.consentBasis ? (
                          <Badge tone="live">{CONSENT_LABELS[lead.consentBasis]}</Badge>
                        ) : (
                          <Badge tone="warn">None · not callable</Badge>
                        )}
                      </td>
                      <td className="py-3 text-ink-2">{SOURCE_LABELS[lead.source]}</td>
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
              onClick={() => void loadMore()}
            >
              {loading ? 'Loading…' : 'Load more'}
            </button>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}
