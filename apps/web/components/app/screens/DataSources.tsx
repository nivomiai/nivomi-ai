'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import {
  CONSENT_BASES,
  CONSENT_LABELS,
  type CrmStatus,
  type ImportJob,
  type Page,
  type ReviewItem,
} from '@/lib/api/types';
import { api } from '@/lib/app/api';
import { formatBytes, formatDateTime, formatNumber } from '@/lib/app/format';
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

const MAX_BYTES = 20 * 1024 * 1024;

/** Messages for the `?crm=` outcome the OAuth callback redirects back with. */
const CALLBACK_MESSAGES: Record<string, { tone: 'success' | 'warn'; text: string }> = {
  connected: { tone: 'success', text: 'HubSpot is connected. The first sync has started.' },
  denied: { tone: 'warn', text: 'HubSpot access was not granted.' },
  invalid_state: { tone: 'warn', text: 'That connection attempt expired. Please try again.' },
  signed_out: { tone: 'warn', text: 'You were signed out. Sign in and connect again.' },
  not_allowed: { tone: 'warn', text: 'Only owners and admins can connect HubSpot.' },
  account_in_use: {
    tone: 'warn',
    text: 'That HubSpot account is already connected to another Nivomi organization.',
  },
  account_change_requires_confirmation: {
    tone: 'warn',
    text: 'That is a different HubSpot account. Use “Connect a different account” to confirm the switch.',
  },
  provider_error: { tone: 'warn', text: 'HubSpot could not be reached. Please try again.' },
};

export const IMPORT_STATUS_LABELS: Record<ImportJob['status'], string> = {
  AWAITING_UPLOAD: 'Uploading',
  ANALYZING: 'Reading file',
  MAPPING_REQUIRED: 'Needs mapping',
  PREVIEWING: 'Preparing preview',
  READY: 'Ready to confirm',
  QUEUED: 'Queued',
  PROCESSING: 'Importing',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
};

export function importTone(status: ImportJob['status']): 'live' | 'warn' | 'accent' | 'neutral' {
  if (status === 'COMPLETED') return 'live';
  if (status === 'FAILED') return 'warn';
  if (status === 'MAPPING_REQUIRED' || status === 'READY') return 'accent';
  return 'neutral';
}

export function DataSources() {
  const { can } = useSession();
  const params = useSearchParams();
  const outcome = params.get('crm');
  const message = outcome ? CALLBACK_MESSAGES[outcome] : undefined;

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Data sources"
        description="Bring leads in from files or HubSpot. Every source goes through the same checks, and nothing is called without a consent basis."
      />
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <div className="grid gap-6 lg:grid-cols-2">
        {can('imports.manage') ? <ImportCard /> : null}
        <CrmCard />
      </div>
      {can('imports.manage') ? <ReviewSummary /> : null}
      {can('imports.manage') ? <ImportHistory /> : null}
    </div>
  );
}

function ImportCard() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const submit = useSubmit();

  const choose = (selected: File | null) => {
    setLocalError(null);
    if (!selected) return setFile(null);
    if (!/\.(csv|xlsx)$/i.test(selected.name)) {
      setFile(null);
      return setLocalError('Choose a .csv or .xlsx file.');
    }
    if (selected.size > MAX_BYTES) {
      setFile(null);
      return setLocalError('Files can be at most 20 MB.');
    }
    setFile(selected);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) return;
    let id = '';
    const ok = await submit.run(async () => {
      const created = await api.post<{
        id: string;
        upload: { url: string; method: string; headers: Record<string, string> };
      }>('/imports', { fileName: file.name, fileSize: file.size });
      await api.upload(created.upload, file);
      await api.post(`/imports/${created.id}/uploaded`);
      id = created.id;
    });
    if (ok) router.push(`/app/data-sources/imports/${id}`);
  };

  return (
    <Panel title="Import a file" description="CSV or Excel (.xlsx), up to 20 MB and 100,000 rows.">
      <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4">
        <FormAlert message={localError ?? submit.error} />
        <label
          htmlFor="import-file"
          className="grid cursor-pointer place-items-center rounded-[16px] border border-dashed border-line px-6 py-8 text-center transition-colors hover:border-line-hover"
        >
          <span className="font-semibold text-ink">{file ? file.name : 'Choose a file'}</span>
          <span className="mt-1 text-sm text-muted">
            {file ? formatBytes(file.size) : 'The first row must hold the column names.'}
          </span>
        </label>
        <input
          id="import-file"
          ref={input}
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          onChange={(e) => choose(e.target.files?.[0] ?? null)}
        />
        <button type="submit" className="btn btn-primary" disabled={!file || submit.pending}>
          {submit.pending ? 'Uploading…' : 'Upload and map columns'}
        </button>
        <p className="text-[13px] text-muted">
          Nothing is imported until you review the preview and confirm.
        </p>
      </form>
    </Panel>
  );
}

function CrmCard() {
  const { can } = useSession();
  const crm = useResource<CrmStatus>('/integrations/crm', {
    pollWhile: (s) => s.runs.some((r) => r.status === 'QUEUED' || r.status === 'RUNNING'),
  });
  const action = useSubmit();

  const connect = (confirmAccountChange: boolean) =>
    action.run(async () => {
      const { authorizeUrl } = await api.post<{ authorizeUrl: string }>(
        '/integrations/crm/hubspot/authorize',
        { confirmAccountChange },
      );
      // HubSpot's consent screen is a full-page navigation outside the app.
      window.location.href = authorizeUrl;
    });

  if (crm.error && !crm.data) return <ErrorBlock message={crm.error} onRetry={crm.reload} />;
  if (!crm.data) return <LoadingBlock />;
  const { connection, available, runs } = crm.data;
  const running = runs.some((r) => r.status === 'QUEUED' || r.status === 'RUNNING');
  const active = connection && connection.status !== 'DISCONNECTED';

  return (
    <Panel
      title="HubSpot"
      description="Optional. Contacts, their companies and HubSpot leads come into Nivomi; Nivomi stays the source of truth."
    >
      <div className="grid gap-4">
        <FormAlert message={action.error} />
        {!available ? (
          <Notice>Connecting HubSpot is not enabled on this workspace yet.</Notice>
        ) : null}
        {connection ? (
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              tone={
                connection.status === 'CONNECTED'
                  ? 'live'
                  : connection.status === 'DISCONNECTED'
                    ? 'neutral'
                    : 'warn'
              }
            >
              {connection.status === 'TOKEN_INVALID'
                ? 'Reconnect needed'
                : connection.status.charAt(0) + connection.status.slice(1).toLowerCase()}
            </Badge>
            <span className="text-sm text-muted">Account {connection.accountId}</span>
            {active && !connection.leadsEnabled ? (
              <Badge tone="soon">HubSpot leads not shared</Badge>
            ) : null}
          </div>
        ) : null}
        {connection?.lastError ? <Notice tone="warn">{connection.lastError}</Notice> : null}
        {connection?.lastSyncAt ? (
          <p className="text-sm text-muted">Last synced {formatDateTime(connection.lastSyncAt)}</p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {available &&
          can('integrations.manage') &&
          (!active || connection.status === 'TOKEN_INVALID') ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={action.pending}
              onClick={() => void connect(false)}
            >
              {connection ? 'Reconnect HubSpot' : 'Connect HubSpot'}
            </button>
          ) : null}
          {active && connection.status !== 'TOKEN_INVALID' && can('integrations.sync') ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={action.pending || running}
              onClick={() =>
                void action
                  .run(() => api.post('/integrations/crm/sync', {}))
                  .then((ok) => ok && crm.reload())
              }
            >
              {running ? 'Syncing…' : 'Sync now'}
            </button>
          ) : null}
          {active && can('integrations.manage') ? (
            <>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={action.pending}
                onClick={() => {
                  if (
                    window.confirm(
                      'Connect a different HubSpot account? Consent mapping is reset and records from the two accounts are kept apart.',
                    )
                  ) {
                    void connect(true);
                  }
                }}
              >
                Connect a different account
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={action.pending}
                onClick={() => {
                  if (
                    !window.confirm(
                      'Disconnect HubSpot? Syncing stops; every lead stays in Nivomi.',
                    )
                  )
                    return;
                  void action
                    .run(() => api.del('/integrations/crm'))
                    .then((ok) => ok && crm.reload());
                }}
              >
                Disconnect
              </button>
            </>
          ) : null}
        </div>

        {active && can('integrations.manage') ? (
          <ConsentMapping settings={connection.settings} onSaved={crm.reload} />
        ) : null}

        {runs.length > 0 ? (
          <div>
            <h3 className="text-sm font-bold text-ink">Recent syncs</h3>
            <ul className="mt-2 divide-y divide-line rounded-[12px] border border-line text-sm">
              {runs.slice(0, 5).map((run) => (
                <li key={run.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                  <span className="min-w-0 flex-1 text-ink-2">
                    {formatDateTime(run.createdAt)} ·{' '}
                    {run.mode === 'FULL' ? 'Full' : 'Changes only'}
                  </span>
                  <span className="text-muted">
                    {formatNumber(run.counts.created)} new · {formatNumber(run.counts.updated)}{' '}
                    updated · {formatNumber(run.counts.skipped)} skipped
                    {run.counts.review ? ` · ${formatNumber(run.counts.review)} to review` : ''}
                  </span>
                  <Badge
                    tone={
                      run.status === 'COMPLETED'
                        ? 'live'
                        : run.status === 'FAILED'
                          ? 'warn'
                          : 'neutral'
                    }
                  >
                    {run.status.charAt(0) + run.status.slice(1).toLowerCase()}
                  </Badge>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[13px] text-muted">
              Contacts without a usable phone number are skipped. Changes sync every 15 minutes.
            </p>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

/** FR-19: which HubSpot property holds consent; contacts without it import as not callable. */
function ConsentMapping({
  settings,
  onSaved,
}: {
  readonly settings: NonNullable<CrmStatus['connection']>['settings'];
  readonly onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [property, setProperty] = useState(settings.consentProperty ?? '');
  const [rows, setRows] = useState<{ value: string; basis: string }[]>(
    Object.entries(settings.consentValueMap ?? {}).map(([value, basis]) => ({ value, basis })),
  );
  const submit = useSubmit();

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const ok = await submit.run(() =>
      api.put('/integrations/crm/settings', {
        consentProperty: property.trim() || null,
        consentValueMap: Object.fromEntries(
          rows.filter((r) => r.value.trim()).map((r) => [r.value.trim(), r.basis]),
        ),
      }),
    );
    if (ok) {
      setOpen(false);
      onSaved();
    }
  };

  if (!open) {
    return (
      <div className="rounded-[12px] border border-line px-4 py-3 text-sm">
        <p className="text-ink-2">
          {settings.consentProperty
            ? `Consent comes from the HubSpot property “${settings.consentProperty}”.`
            : 'No consent property is mapped: HubSpot contacts arrive without a consent basis and cannot be called.'}
        </p>
        <button
          type="button"
          className="mt-2 font-semibold text-accent hover:underline"
          onClick={() => setOpen(true)}
        >
          {settings.consentProperty ? 'Change consent mapping' : 'Map a consent property'}
        </button>
      </div>
    );
  }
  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      className="grid gap-3 rounded-[12px] border border-line p-4"
    >
      <FormAlert message={submit.error} />
      <Field
        id="consent-property"
        label="HubSpot property (internal name)"
        placeholder="e.g. nivomi_consent"
        value={property}
        onChange={(e) => setProperty(e.target.value)}
      />
      <p className="text-sm font-semibold text-ink">Property value → consent basis</p>
      {rows.map((row, index) => (
        <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
          <input
            aria-label={`HubSpot value ${index + 1}`}
            className="rounded-[10px] border border-line bg-surface px-3 py-2 text-sm text-ink"
            value={row.value}
            onChange={(e) =>
              setRows((r) => r.map((x, i) => (i === index ? { ...x, value: e.target.value } : x)))
            }
          />
          <select
            aria-label={`Consent basis for value ${index + 1}`}
            className="rounded-[10px] border border-line bg-surface px-3 py-2 text-sm text-ink"
            value={row.basis}
            onChange={(e) =>
              setRows((r) => r.map((x, i) => (i === index ? { ...x, basis: e.target.value } : x)))
            }
          >
            {CONSENT_BASES.map((b) => (
              <option key={b} value={b}>
                {CONSENT_LABELS[b]}
              </option>
            ))}
            <option value="DND">Opted out (never call)</option>
          </select>
          <button
            type="button"
            className="text-sm font-semibold text-muted hover:text-accent"
            onClick={() => setRows((r) => r.filter((_, i) => i !== index))}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="justify-self-start text-sm font-semibold text-accent hover:underline"
        onClick={() => setRows((r) => [...r, { value: '', basis: 'INQUIRY' }])}
      >
        Add a value
      </button>
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary btn-sm" disabled={submit.pending}>
          Save mapping
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      <p className="text-[13px] text-muted">
        Applies from the next sync. Use “Sync now” to apply it straight away.
      </p>
    </form>
  );
}

function ReviewSummary() {
  const reviews = useResource<Page<ReviewItem>>('/ingestion/reviews?limit=1');
  if (!reviews.data || reviews.data.items.length === 0) return null;
  return (
    <Notice tone="warn">
      Some records look like duplicates and were not merged automatically.{' '}
      <Link href="/app/data-sources/review" className="font-semibold underline underline-offset-4">
        Review possible duplicates
      </Link>
    </Notice>
  );
}

function ImportHistory() {
  const history = useResource<Page<ImportJob>>('/imports?limit=25', {
    pollWhile: (p) =>
      p.items.some((i) => ['ANALYZING', 'PREVIEWING', 'QUEUED', 'PROCESSING'].includes(i.status)),
  });
  return (
    <Panel title="Import history">
      {history.error ? <ErrorBlock message={history.error} onRetry={history.reload} /> : null}
      {!history.data && !history.error ? <LoadingBlock /> : null}
      {history.data && history.data.items.length === 0 ? (
        <EmptyState icon="i-db" title="No imports yet" />
      ) : null}
      {history.data && history.data.items.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs tracking-[0.08em] text-muted uppercase">
                <th scope="col" className="py-3 pr-4 font-bold">
                  File
                </th>
                <th scope="col" className="py-3 pr-4 font-bold">
                  Rows
                </th>
                <th scope="col" className="py-3 pr-4 font-bold">
                  Imported
                </th>
                <th scope="col" className="py-3 pr-4 font-bold">
                  Failed
                </th>
                <th scope="col" className="py-3 font-bold">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {history.data.items.map((job) => (
                <tr key={job.id}>
                  <td className="py-3 pr-4">
                    <Link
                      href={`/app/data-sources/imports/${job.id}`}
                      className="font-semibold text-ink hover:text-accent hover:underline"
                    >
                      {job.fileName}
                    </Link>
                    <p className="text-[13px] text-muted">{formatDateTime(job.createdAt)}</p>
                  </td>
                  <td className="py-3 pr-4 text-ink-2">{formatNumber(job.counts.total)}</td>
                  <td className="py-3 pr-4 text-ink-2">{formatNumber(job.counts.succeeded)}</td>
                  <td className="py-3 pr-4 text-ink-2">{formatNumber(job.counts.failed)}</td>
                  <td className="py-3">
                    <Badge tone={importTone(job.status)}>{IMPORT_STATUS_LABELS[job.status]}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Panel>
  );
}
