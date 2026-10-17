'use client';

import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../api/client';
import type { BulkResult, LeadExport, LeadListItem, LeadStatus, NumberedPage } from '../api/types';
import { api } from './api';
import { saveBlob } from './format';

export interface LeadFilters {
  readonly search: string;
  readonly status: string;
  readonly consent: string;
  readonly source: string;
}

export type LeadSortKey =
  'name' | 'phone' | 'status' | 'consent' | 'source' | 'activity' | 'created';

export interface LeadSort {
  readonly key: LeadSortKey;
  readonly order: 'asc' | 'desc';
}

const EMPTY_FILTERS: LeadFilters = { search: '', status: '', consent: '', source: '' };

function pageQuery(filters: LeadFilters, sort: LeadSort, page: number, pageSize: number): string {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    sort: sort.key,
    order: sort.order,
  });
  for (const key of ['search', 'status', 'consent', 'source'] as const) {
    if (filters[key]) params.set(key, filters[key]);
  }
  return `/leads?${params.toString()}`;
}

/**
 * State for the leads table: filters (search debounced), sort, page, selection and the loaded
 * page. Changing a filter or the sort returns to page 1; selection survives paging.
 */
export function useLeadsTable() {
  const [filters, setFilters] = useState<LeadFilters>(EMPTY_FILTERS);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<LeadSort>({ key: 'created', order: 'desc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [data, setData] = useState<NumberedPage<LeadListItem>>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((f) => (f.search === search.trim() ? f : { ...f, search: search.trim() }));
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api
      .get<NumberedPage<LeadListItem>>(pageQuery(filters, sort, page, pageSize), controller.signal)
      .then((result) => {
        // A page past the end (rows were removed) falls back to the last real page.
        const last = Math.max(1, Math.ceil(result.total / pageSize));
        if (page > last) setPage(last);
        else setData(result);
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [filters, sort, page, pageSize, version]);

  const setFilter = useCallback((key: keyof Omit<LeadFilters, 'search'>, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  }, []);

  const sortBy = useCallback((key: string) => {
    setSort((current) =>
      current.key === key
        ? { key: current.key, order: current.order === 'asc' ? 'desc' : 'asc' }
        : { key: key as LeadSortKey, order: 'asc' },
    );
    setPage(1);
  }, []);

  const changePageSize = useCallback((size: number) => {
    setPageSize(size);
    setPage(1);
  }, []);

  return {
    filters,
    search,
    setSearch,
    setFilter,
    sort,
    sortBy,
    page,
    setPage,
    pageSize,
    changePageSize,
    data,
    loading,
    error,
    selected,
    setSelected,
    reload: useCallback(() => setVersion((v) => v + 1), []),
    filtered: Object.values(filters).some(Boolean),
  };
}

// ── Actions ──────────────────────────────────────────────────────────────

export function bulkChangeStatus(leadIds: readonly string[], status: LeadStatus, key: string) {
  return api.post<BulkResult>('/leads/bulk/status', { leadIds, status }, key);
}

export function bulkSuppress(leadIds: readonly string[], reason: string) {
  return api.post<BulkResult>('/leads/bulk/suppress', {
    leadIds,
    reason: reason.trim() || null,
  });
}

export function addToCampaign(campaignId: string, leadIds: readonly string[]) {
  return api.post<{ added: number; alreadyIncluded: number }>(`/campaigns/${campaignId}/leads`, {
    leadIds,
  });
}

const POLL_MS = 1_500;
const POLL_LIMIT = 120; // three minutes

/**
 * Queues a CSV export (the ticked leads, or everything matching the filters), waits for the
 * background job, then saves the file. Resolves with the number of rows exported.
 */
export async function exportLeads(
  selection: { leadIds: readonly string[] } | { filters: LeadFilters },
): Promise<number> {
  const body =
    'leadIds' in selection
      ? { leadIds: selection.leadIds }
      : {
          filters: Object.fromEntries(
            Object.entries(selection.filters).filter(([, value]) => Boolean(value)),
          ),
        };
  let current = await api.post<LeadExport>('/leads/exports', body);
  for (let i = 0; i < POLL_LIMIT && !['COMPLETED', 'FAILED'].includes(current.status); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    current = await api.get<LeadExport>(`/leads/exports/${current.id}`);
  }
  if (current.status === 'FAILED') {
    throw new Error(current.error ?? 'The export could not be prepared. Try again.');
  }
  if (current.status !== 'COMPLETED') {
    throw new Error('The export is taking longer than usual. Try again in a few minutes.');
  }
  const file = await api.download(`/leads/exports/${current.id}/file`);
  saveBlob(file.blob, file.fileName ?? 'nivomi-leads.csv');
  return current.rowCount ?? 0;
}

/** One sentence for the result banner, e.g. "Updated 2 leads. 1 could not be changed." */
export function describeBulk(result: BulkResult, verb: string): string {
  const parts = [`${verb} ${result.updated} lead${result.updated === 1 ? '' : 's'}.`];
  if (result.unchanged > 0) {
    parts.push(`${result.unchanged} already ${result.unchanged === 1 ? 'was' : 'were'} set.`);
  }
  if (result.failed.length > 0) {
    const reasons = [...new Set(result.failed.map((f) => f.reason))].join(' ');
    parts.push(`${result.failed.length} could not be changed: ${reasons}`);
  }
  return parts.join(' ');
}

const NEW_CAMPAIGN_LEADS_KEY = 'nv.campaign.newLeads';

/** Hands the ticked leads to the new-campaign form (this tab only). */
export function stashLeadsForNewCampaign(leadIds: readonly string[]): void {
  try {
    window.sessionStorage.setItem(NEW_CAMPAIGN_LEADS_KEY, JSON.stringify(leadIds));
  } catch {
    // Storage blocked: the form opens without a pre-filled list.
  }
}

/** Reads and clears the leads handed over by `stashLeadsForNewCampaign`. */
export function takeLeadsForNewCampaign(): string[] {
  try {
    const raw = window.sessionStorage.getItem(NEW_CAMPAIGN_LEADS_KEY);
    window.sessionStorage.removeItem(NEW_CAMPAIGN_LEADS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}
