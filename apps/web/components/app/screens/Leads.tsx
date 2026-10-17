'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { errorMessage } from '@/lib/api/client';
import {
  CONSENT_LABELS,
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  SOURCE_LABELS,
  type CampaignListItem,
  type LeadListItem,
  type LeadStatus,
  type Page,
} from '@/lib/api/types';
import { api } from '@/lib/app/api';
import { formatPhone, formatRelative } from '@/lib/app/format';
import {
  addToCampaign,
  bulkChangeStatus,
  bulkSuppress,
  describeBulk,
  exportLeads,
  stashLeadsForNewCampaign,
  useLeadsTable,
} from '@/lib/app/leads-table';
import { useSession } from '@/lib/app/session';
import { useSubmit } from '@/lib/app/use-submit';
import { Icon } from '@/components/marketing/primitives';
import {
  ActionMenu,
  Checkbox,
  DataTable,
  IconCell,
  Pagination,
  SearchInput,
  StatusPill,
  rangeLabel,
  type Column,
  type MenuItem,
  type PillTone,
} from '../DataTable';
import { Dialog } from '../Dialog';
import {
  EmptyState,
  ErrorBlock,
  Field,
  FormAlert,
  LoadingBlock,
  Notice,
  PageHeader,
  SelectField,
  SubmitButton,
} from '../ui';

/** Badge tone for a lead status (lead detail page). */
export function statusTone(status: LeadStatus): 'neutral' | 'accent' | 'live' | 'warn' {
  if (['QUALIFIED', 'APPOINTMENT_BOOKED', 'CONVERTED', 'INTERESTED'].includes(status))
    return 'live';
  if (['DO_NOT_CALL', 'NOT_INTERESTED', 'UNREACHABLE', 'CLOSED'].includes(status)) return 'warn';
  if (status === 'NEW') return 'accent';
  return 'neutral';
}

/** Pill tone for a lead status in the table. */
export function statusPillTone(status: LeadStatus): PillTone {
  switch (status) {
    case 'INTERESTED':
    case 'QUALIFIED':
    case 'CONNECTED':
    case 'APPOINTMENT_BOOKED':
    case 'CONVERTED':
      return 'live';
    case 'NEW':
    case 'FOLLOW_UP':
      return 'accent';
    case 'CONTACTED':
    case 'ATTEMPTED':
      return 'info';
    case 'CALLBACK_REQUESTED':
      return 'soon';
    case 'DO_NOT_CALL':
      return 'danger';
    default:
      return 'warn';
  }
}

type Action =
  | { kind: 'status'; leadIds: string[] }
  | { kind: 'suppress'; leadIds: string[] }
  | { kind: 'campaign'; leadIds: string[] };

export function Leads() {
  const { can } = useSession();
  const router = useRouter();
  const table = useLeadsTable();
  const [action, setAction] = useState<Action | null>(null);
  const [banner, setBanner] = useState<{ tone: 'success' | 'warn'; text: string } | null>(null);
  const [exporting, setExporting] = useState(false);

  const selectedIds = [...table.selected];
  const rows = table.data?.items ?? [];
  const total = table.data?.total ?? 0;

  const finish = (text: string, tone: 'success' | 'warn' = 'success') => {
    setAction(null);
    setBanner({ tone, text });
    table.setSelected(new Set());
    table.reload();
  };

  const runExport = async (selection: Parameters<typeof exportLeads>[0]) => {
    setExporting(true);
    setBanner(null);
    try {
      const count = await exportLeads(selection);
      setBanner({
        tone: 'success',
        text: `Exported ${count} lead${count === 1 ? '' : 's'} to CSV.`,
      });
    } catch (e) {
      setBanner({ tone: 'warn', text: errorMessage(e) });
    } finally {
      setExporting(false);
    }
  };

  const actionsFor = (leadIds: string[]): MenuItem[] => [
    ...(can('leads.write')
      ? [
          {
            label: 'Change status',
            icon: 'i-refresh' as const,
            onSelect: () => setAction({ kind: 'status', leadIds }),
          },
        ]
      : []),
    ...(can('campaigns.manage')
      ? [
          {
            label: 'Add to a campaign',
            icon: 'i-phone' as const,
            onSelect: () => setAction({ kind: 'campaign', leadIds }),
          },
        ]
      : []),
    ...(can('leads.export')
      ? [
          {
            label: 'Export CSV',
            icon: 'i-arrow-ur' as const,
            onSelect: () => void runExport({ leadIds }),
            disabled: exporting,
          },
        ]
      : []),
    ...(can('suppression.manage')
      ? [
          {
            label: 'Add to suppression list',
            icon: 'i-shield' as const,
            tone: 'danger' as const,
            onSelect: () => setAction({ kind: 'suppress', leadIds }),
          },
        ]
      : []),
  ];

  const columns: Column<LeadListItem>[] = [
    {
      id: 'lead',
      header: 'Lead',
      sortKey: 'name',
      cell: (lead) => (
        <div className="min-w-0">
          <Link
            href={`/app/leads/${lead.id}`}
            className="font-semibold text-ink hover:text-accent hover:underline"
          >
            {lead.fullName}
          </Link>
          <p className="mt-0.5 truncate text-[13px] text-muted">
            {lead.company ?? lead.email ?? '—'}
          </p>
        </div>
      ),
    },
    {
      id: 'phone',
      header: 'Phone',
      sortKey: 'phone',
      cell: (lead) => (
        <span className="inline-flex flex-wrap items-center gap-2">
          <IconCell icon="i-phone">{formatPhone(lead.phone)}</IconCell>
          {lead.suppressed ? <StatusPill tone="danger">Suppressed</StatusPill> : null}
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      sortKey: 'status',
      cell: (lead) => (
        <StatusPill tone={statusPillTone(lead.status)}>
          {LEAD_STATUS_LABELS[lead.status]}
        </StatusPill>
      ),
    },
    {
      id: 'consent',
      header: 'Consent',
      sortKey: 'consent',
      cell: (lead) =>
        lead.consentBasis ? (
          <StatusPill tone="live">{CONSENT_LABELS[lead.consentBasis]}</StatusPill>
        ) : (
          <StatusPill tone="warn">None · not callable</StatusPill>
        ),
    },
    {
      id: 'source',
      header: 'Source',
      sortKey: 'source',
      cell: (lead) => (
        <IconCell icon={lead.source === 'MANUAL' ? 'i-user' : 'i-db'}>
          {SOURCE_LABELS[lead.source]}
        </IconCell>
      ),
    },
    {
      id: 'activity',
      header: 'Last activity',
      sortKey: 'activity',
      cell: (lead) => (
        <IconCell icon="i-clock">
          <time dateTime={lead.updatedAt} title={new Date(lead.updatedAt).toLocaleString('en-IN')}>
            {formatRelative(lead.updatedAt)}
          </time>
        </IconCell>
      ),
    },
  ];

  const pageIds = rows.map((r) => r.id);
  const selectedOnPage = pageIds.filter((id) => table.selected.has(id)).length;
  const bulkItems = actionsFor(selectedIds);

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Leads"
        description="Manage, filter, and follow up with your leads."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/app/leads/suppression" className="btn btn-secondary btn-sm">
              Suppression list
            </Link>
            {can('leads.export') ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={exporting || total === 0}
                onClick={() => void runExport({ filters: table.filters })}
              >
                <Icon name="i-arrow-ur" className="size-4" />
                {exporting ? 'Preparing…' : 'Export'}
              </button>
            ) : null}
            {can('leads.write') ? (
              <Link href="/app/leads/new" className="btn btn-primary btn-sm">
                <Icon name="i-plus" className="size-4" />
                Add lead
              </Link>
            ) : null}
          </div>
        }
      />

      <section className="card-nv grid gap-5 p-5 sm:p-6">
        <div className="grid gap-4 md:grid-cols-[1.6fr_1fr_1fr_1fr] md:items-end">
          <SearchInput
            id="lead-search"
            label="Search leads"
            placeholder="Search leads…"
            value={table.search}
            onChange={table.setSearch}
          />
          <SelectField
            id="lead-status"
            label="Status"
            value={table.filters.status}
            onChange={(v) => table.setFilter('status', v)}
            options={[
              { value: '', label: 'Any status' },
              ...LEAD_STATUSES.map((s) => ({ value: s, label: LEAD_STATUS_LABELS[s] })),
            ]}
          />
          <SelectField
            id="lead-consent"
            label="Consent"
            value={table.filters.consent}
            onChange={(v) => table.setFilter('consent', v)}
            options={[
              { value: '', label: 'Any consent' },
              { value: 'with_basis', label: 'Has a consent basis' },
              { value: 'missing', label: 'No consent basis' },
            ]}
          />
          <SelectField
            id="lead-source"
            label="Source"
            value={table.filters.source}
            onChange={(v) => table.setFilter('source', v)}
            options={[
              { value: '', label: 'Any source' },
              { value: 'FILE_IMPORT', label: 'File import' },
              { value: 'MANUAL', label: 'Manual' },
            ]}
          />
        </div>

        {banner ? <Notice tone={banner.tone}>{banner.text}</Notice> : null}

        {bulkItems.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-3 rounded-[12px] border border-line bg-card px-3 py-2">
                <Checkbox
                  label="Select all leads on this page"
                  checked={rows.length > 0 && selectedOnPage === rows.length}
                  indeterminate={selectedOnPage > 0 && selectedOnPage < rows.length}
                  disabled={rows.length === 0}
                  onChange={(checked) => {
                    const next = new Set(table.selected);
                    for (const id of pageIds) {
                      if (checked) next.add(id);
                      else next.delete(id);
                    }
                    table.setSelected(next);
                  }}
                />
                <span className="text-sm font-semibold text-ink" aria-live="polite">
                  {table.selected.size} selected
                </span>
                {table.selected.size > 0 ? (
                  <button
                    type="button"
                    className="text-sm font-semibold text-accent hover:underline"
                    onClick={() => table.setSelected(new Set())}
                  >
                    Clear
                  </button>
                ) : null}
              </span>
              {table.selected.size > 0 ? (
                <ActionMenu
                  label="Bulk actions"
                  align="start"
                  items={bulkItems}
                  triggerClassName="inline-flex items-center gap-2 rounded-[12px] border border-accent/40 bg-card px-4 py-2 text-sm font-semibold text-accent transition-colors hover:bg-accent-soft"
                  trigger={
                    <>
                      Bulk actions
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 20 20"
                        className="size-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.8}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="m5 7.5 5 5 5-5" />
                      </svg>
                    </>
                  }
                />
              ) : null}
            </div>
            <p className="text-sm text-muted">
              {rangeLabel(table.page, table.pageSize, total, 'leads')}
            </p>
          </div>
        ) : null}

        {table.error ? <ErrorBlock message={table.error} onRetry={table.reload} /> : null}
        {!table.error && !table.data && table.loading ? (
          <LoadingBlock label="Loading leads" />
        ) : null}
        {!table.error && table.data && rows.length === 0 ? (
          <EmptyState
            icon="i-users"
            title={table.filtered ? 'No leads match these filters' : 'No leads yet'}
          >
            {table.filtered ? null : (
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
        {rows.length > 0 ? (
          <>
            <DataTable
              caption="Leads"
              columns={columns}
              rows={rows}
              rowKey={(lead) => lead.id}
              rowLabel={(lead) => lead.fullName}
              sort={table.sort}
              onSort={table.sortBy}
              {...(bulkItems.length > 0
                ? { selected: table.selected, onSelectedChange: table.setSelected }
                : {})}
              rowActions={(lead) => [
                {
                  label: 'View lead',
                  icon: 'i-user',
                  onSelect: () => router.push(`/app/leads/${lead.id}`),
                },
                ...actionsFor([lead.id]),
              ]}
              busy={table.loading}
              minWidth={1080}
            />
            <Pagination
              idPrefix="leads"
              page={table.page}
              pageSize={table.pageSize}
              total={total}
              onPageChange={table.setPage}
              onPageSizeChange={table.changePageSize}
            />
          </>
        ) : null}
      </section>

      {action?.kind === 'status' ? (
        <StatusDialog
          leadIds={action.leadIds}
          onClose={() => setAction(null)}
          onDone={(text) => finish(text)}
        />
      ) : null}
      {action?.kind === 'suppress' ? (
        <SuppressDialog
          leadIds={action.leadIds}
          onClose={() => setAction(null)}
          onDone={(text) => finish(text)}
        />
      ) : null}
      {action?.kind === 'campaign' ? (
        <CampaignDialog
          leadIds={action.leadIds}
          onClose={() => setAction(null)}
          onDone={(text) => finish(text)}
        />
      ) : null}
    </div>
  );
}

const leadCount = (n: number) => `${n} lead${n === 1 ? '' : 's'}`;

function StatusDialog({
  leadIds,
  onClose,
  onDone,
}: {
  readonly leadIds: string[];
  readonly onClose: () => void;
  readonly onDone: (text: string) => void;
}) {
  const [status, setStatus] = useState<string>('');
  // One key per dialog: a retried submit replays instead of changing twice.
  const [key] = useState(() => crypto.randomUUID());
  const submit = useSubmit();
  return (
    <Dialog
      title="Change status"
      description={`Set a new status for ${leadCount(leadIds.length)}. Each change is recorded on the lead’s timeline.`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <SubmitButton
            pending={submit.pending}
            pendingLabel="Saving…"
            className="btn-sm w-auto!"
            form="bulk-status-form"
          >
            Change status
          </SubmitButton>
        </>
      }
    >
      <form
        id="bulk-status-form"
        noValidate
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!status) return;
          void submit.run(async () => {
            onDone(
              describeBulk(await bulkChangeStatus(leadIds, status as LeadStatus, key), 'Updated'),
            );
          });
        }}
      >
        <FormAlert message={submit.error} />
        <SelectField
          id="bulk-status"
          label="New status"
          value={status}
          onChange={setStatus}
          options={LEAD_STATUSES.map((s) => ({ value: s, label: LEAD_STATUS_LABELS[s] }))}
        />
      </form>
    </Dialog>
  );
}

function SuppressDialog({
  leadIds,
  onClose,
  onDone,
}: {
  readonly leadIds: string[];
  readonly onClose: () => void;
  readonly onDone: (text: string) => void;
}) {
  const [reason, setReason] = useState('');
  const submit = useSubmit();
  return (
    <Dialog
      title="Add to suppression list"
      description={`Nivomi will never call the phone numbers of ${leadCount(leadIds.length)} again, in any campaign.`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <SubmitButton
            pending={submit.pending}
            pendingLabel="Adding…"
            className="btn-sm w-auto!"
            form="bulk-suppress-form"
          >
            Add to suppression list
          </SubmitButton>
        </>
      }
    >
      <form
        id="bulk-suppress-form"
        noValidate
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit.run(async () => {
            onDone(describeBulk(await bulkSuppress(leadIds, reason), 'Suppressed'));
          });
        }}
      >
        <FormAlert message={submit.error} />
        <Field
          id="bulk-suppress-reason"
          label="Reason (optional)"
          placeholder="e.g. Asked not to be called"
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </form>
    </Dialog>
  );
}

function CampaignDialog({
  leadIds,
  onClose,
  onDone,
}: {
  readonly leadIds: string[];
  readonly onClose: () => void;
  readonly onDone: (text: string) => void;
}) {
  const [campaignId, setCampaignId] = useState('');
  const [campaigns, setCampaigns] = useState<CampaignListItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const submit = useSubmit();
  const router = useRouter();

  useEffect(() => {
    const controller = new AbortController();
    api
      .get<Page<CampaignListItem>>('/campaigns?limit=100', controller.signal)
      .then((page) =>
        setCampaigns(page.items.filter((c) => c.status === 'DRAFT' && c.selectionKind === 'LIST')),
      )
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setLoadError(errorMessage(e));
      });
    return () => controller.abort();
  }, []);

  return (
    <Dialog
      title="Add to a campaign"
      description={`Adds ${leadCount(leadIds.length)} to a draft campaign’s hand-picked list, or starts a new campaign with them. Every lead is still checked for consent, do-not-call and calling hours before launch.`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              stashLeadsForNewCampaign(leadIds);
              router.push('/app/campaigns/new');
            }}
          >
            New campaign with these leads
          </button>
          {campaigns && campaigns.length > 0 ? (
            <SubmitButton
              pending={submit.pending}
              pendingLabel="Adding…"
              className="btn-sm w-auto!"
              form="bulk-campaign-form"
            >
              Add to campaign
            </SubmitButton>
          ) : null}
        </>
      }
    >
      <form
        id="bulk-campaign-form"
        noValidate
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!campaignId) return;
          void submit.run(async () => {
            const result = await addToCampaign(campaignId, leadIds);
            const name = campaigns?.find((c) => c.id === campaignId)?.name ?? 'the campaign';
            onDone(
              result.added > 0
                ? `Added ${leadCount(result.added)} to ${name}. Run its pre-launch check again before launching.`
                : `These leads were already in ${name}.`,
            );
          });
        }}
      >
        <FormAlert message={submit.error ?? loadError} />
        {campaigns === null && !loadError ? <LoadingBlock label="Loading campaigns" /> : null}
        {campaigns?.length === 0 ? (
          <Notice>
            No draft campaign has a hand-picked list yet. Start a new one with these leads.
          </Notice>
        ) : null}
        {campaigns && campaigns.length > 0 ? (
          <SelectField
            id="bulk-campaign"
            label="Draft campaign"
            value={campaignId}
            onChange={setCampaignId}
            options={campaigns.map((c) => ({ value: c.id, label: c.name }))}
          />
        ) : null}
      </form>
    </Dialog>
  );
}
