'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { CONSENT_BASES, CONSENT_LABELS, type ImportField, type ImportJob } from '@/lib/api/types';
import { api } from '@/lib/app/api';
import { formatNumber, saveBlob } from '@/lib/app/format';
import { useResource } from '@/lib/app/use-resource';
import { useSubmit } from '@/lib/app/use-submit';
import {
  Badge,
  ErrorBlock,
  Field,
  FormAlert,
  LoadingBlock,
  Notice,
  PageHeader,
  Panel,
  Stat,
} from '../ui';
import { IMPORT_STATUS_LABELS, importTone } from './DataSources';

const WORKING: ImportJob['status'][] = [
  'AWAITING_UPLOAD',
  'ANALYZING',
  'PREVIEWING',
  'QUEUED',
  'PROCESSING',
];

export function ImportWizard({ id }: { readonly id: string }) {
  const job = useResource<ImportJob>(`/imports/${id}`, {
    pollWhile: (j) => WORKING.includes(j.status),
  });
  const fields = useResource<{ items: ImportField[] }>('/imports/fields');
  const [remapping, setRemapping] = useState(false);

  if (job.error && !job.data) {
    return (
      <div className="grid gap-6">
        <PageHeader title="Import" />
        <ErrorBlock message={job.error} onRetry={job.reload} />
      </div>
    );
  }
  if (!job.data) return <LoadingBlock label="Loading import" />;
  const data = job.data;

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
            title={data.fileName}
            description={`${formatNumber(data.counts.total)} data rows`}
            actions={
              <Badge tone={importTone(data.status)}>{IMPORT_STATUS_LABELS[data.status]}</Badge>
            }
          />
        </div>
      </div>
      <Steps status={data.status} />
      {WORKING.includes(data.status) && data.status !== 'PROCESSING' ? (
        <Panel>
          <LoadingBlock label={IMPORT_STATUS_LABELS[data.status]} />
          <p className="mt-4 text-sm text-muted">
            {data.status === 'QUEUED'
              ? 'Your import will start shortly.'
              : 'This usually takes a few seconds.'}
          </p>
        </Panel>
      ) : null}
      {(data.status === 'MAPPING_REQUIRED' || (data.status === 'READY' && remapping)) &&
      fields.data ? (
        <MappingStep
          job={data}
          fields={fields.data.items}
          onSaved={() => {
            setRemapping(false);
            job.reload();
          }}
        />
      ) : null}
      {data.status === 'READY' && !remapping ? (
        <PreviewStep job={data} onChanged={job.reload} onRemap={() => setRemapping(true)} />
      ) : null}
      {data.status === 'PROCESSING' ? <Progress job={data} /> : null}
      {data.status === 'COMPLETED' ? <Result job={data} /> : null}
      {data.status === 'FAILED' ? (
        <ErrorBlock message={data.error ?? 'This import could not be completed.'} />
      ) : null}
      {data.status === 'CANCELLED' ? (
        <Notice>This import was cancelled. Nothing was imported.</Notice>
      ) : null}
    </div>
  );
}

const STEP_ORDER = ['Upload', 'Map columns', 'Preview', 'Import'] as const;
function stepIndex(status: ImportJob['status']): number {
  if (status === 'AWAITING_UPLOAD' || status === 'ANALYZING') return 0;
  if (status === 'MAPPING_REQUIRED' || status === 'PREVIEWING') return 1;
  if (status === 'READY') return 2;
  return 3;
}

function Steps({ status }: { readonly status: ImportJob['status'] }) {
  const current = stepIndex(status);
  return (
    <ol className="flex flex-wrap gap-2" aria-label="Import steps">
      {STEP_ORDER.map((label, index) => (
        <li
          key={label}
          aria-current={index === current ? 'step' : undefined}
          className={
            index === current
              ? 'rounded-full bg-accent-soft px-3 py-1 text-sm font-semibold text-accent'
              : index < current
                ? 'rounded-full bg-live-soft px-3 py-1 text-sm font-semibold text-live'
                : 'rounded-full bg-soft px-3 py-1 text-sm text-muted'
          }
        >
          {index + 1}. {label}
        </li>
      ))}
    </ol>
  );
}

function MappingStep({
  job,
  fields,
  onSaved,
}: {
  readonly job: ImportJob;
  readonly fields: ImportField[];
  readonly onSaved: () => void;
}) {
  const headers = job.headers ?? [];
  const [mapping, setMapping] = useState<Record<string, string>>(
    () => job.mapping ?? job.suggestedMapping ?? {},
  );
  const [customNames, setCustomNames] = useState<Record<string, string>>({});
  const [country, setCountry] = useState('IN');
  const [consent, setConsent] = useState({
    enabled: false,
    basis: 'INQUIRY',
    source: '',
    reference: '',
    attested: false,
  });
  const submit = useSubmit();

  useEffect(() => {
    // Seed custom-field names from any saved mapping.
    const names: Record<string, string> = {};
    for (const [header, target] of Object.entries(job.mapping ?? {})) {
      if (target.startsWith('custom:')) names[header] = target.slice('custom:'.length);
    }
    setCustomNames(names);
  }, [job.mapping]);

  const sample = (index: number) =>
    (job.sampleRows ?? [])
      .map((r) => r.cells[index])
      .filter(Boolean)
      .slice(0, 2)
      .join(', ');

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const finalMapping: Record<string, string> = {};
    for (const header of headers) {
      const target = mapping[header] ?? 'ignore';
      finalMapping[header] =
        target === 'custom' ? `custom:${(customNames[header] ?? header).trim()}` : target;
    }
    await submit.run(() =>
      api.put(`/imports/${job.id}/mapping`, {
        mapping: finalMapping,
        defaultCountry: country,
        consentDefault: consent.enabled
          ? {
              basis: consent.basis,
              source: consent.source || null,
              reference: consent.reference || null,
              attested: consent.attested,
            }
          : null,
      }),
    );
    onSaved();
  };

  const used = new Set(Object.values(mapping).filter((t) => t !== 'ignore' && t !== 'custom'));

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="grid gap-6">
      <Panel
        title="Match your columns"
        description="We suggested matches from common column names. Check every row: unmatched columns are ignored, never guessed."
      >
        <div className="grid gap-3">
          <FormAlert message={submit.error} />
          {headers.map((header, index) => {
            const value = mapping[header]?.startsWith('custom:')
              ? 'custom'
              : (mapping[header] ?? 'ignore');
            return (
              <div
                key={header}
                className="grid gap-2 rounded-[12px] border border-line p-3 sm:grid-cols-[1fr_1fr] sm:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{header}</p>
                  <p className="truncate text-[13px] text-muted">
                    {sample(index) || 'No sample values'}
                  </p>
                </div>
                <div className="grid gap-2">
                  <select
                    aria-label={`Nivomi field for column ${header}`}
                    className="rounded-[10px] border border-line bg-surface px-3 py-2.5 text-sm text-ink"
                    value={value}
                    onChange={(e) => setMapping((m) => ({ ...m, [header]: e.target.value }))}
                  >
                    <option value="ignore">Don’t import</option>
                    {fields.map((f) => (
                      <option
                        key={f.key}
                        value={f.key}
                        disabled={used.has(f.key) && value !== f.key}
                      >
                        {f.label}
                        {f.required ? ' (required)' : ''}
                      </option>
                    ))}
                    <option value="custom">Custom field…</option>
                  </select>
                  {value === 'custom' ? (
                    <input
                      aria-label={`Custom field name for ${header}`}
                      className="rounded-[10px] border border-line bg-surface px-3 py-2 text-sm text-ink"
                      value={customNames[header] ?? header}
                      maxLength={60}
                      onChange={(e) => setCustomNames((n) => ({ ...n, [header]: e.target.value }))}
                    />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title="Phone numbers">
        <Field
          id="import-country"
          label="Default country for numbers without a country code"
          hint="Two-letter code, e.g. IN for India."
          maxLength={2}
          value={country}
          onChange={(e) => setCountry(e.target.value.toUpperCase())}
          className="max-w-xs"
        />
      </Panel>

      <Panel
        title="Consent basis"
        description="A lead without a consent basis is imported but never called. If every row came from a source that gives you a basis, you can apply it to rows that don’t carry their own."
      >
        <div className="grid gap-4">
          <label className="flex items-start gap-3 text-sm text-ink">
            <input
              type="checkbox"
              className="mt-1 accent-[var(--nv-pink)]"
              checked={consent.enabled}
              onChange={(e) => setConsent((c) => ({ ...c, enabled: e.target.checked }))}
            />
            Apply a consent basis to rows without one
          </label>
          {consent.enabled ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="import-basis" className="text-sm font-semibold text-ink">
                  Basis
                </label>
                <select
                  id="import-basis"
                  className="mt-1.5 w-full rounded-[12px] border border-line bg-surface px-4 py-3 text-[15px] text-ink"
                  value={consent.basis}
                  onChange={(e) => setConsent((c) => ({ ...c, basis: e.target.value }))}
                >
                  {CONSENT_BASES.map((b) => (
                    <option key={b} value={b}>
                      {CONSENT_LABELS[b]}
                    </option>
                  ))}
                </select>
              </div>
              <Field
                id="import-consent-source"
                label="Where these leads came from"
                placeholder="e.g. Website enquiry form"
                value={consent.source}
                onChange={(e) => setConsent((c) => ({ ...c, source: e.target.value }))}
              />
              <Field
                id="import-consent-ref"
                label={
                  consent.basis === 'REGISTERED_CONSENT'
                    ? 'Operator consent reference'
                    : 'Reference (optional)'
                }
                value={consent.reference}
                onChange={(e) => setConsent((c) => ({ ...c, reference: e.target.value }))}
              />
              <label className="flex items-start gap-3 text-sm text-ink sm:col-span-3">
                <input
                  type="checkbox"
                  className="mt-1 accent-[var(--nv-pink)]"
                  checked={consent.attested}
                  onChange={(e) => setConsent((c) => ({ ...c, attested: e.target.checked }))}
                />
                I confirm our organization holds this consent basis for every row without its own,
                and can show the evidence if asked.
              </label>
            </div>
          ) : null}
        </div>
      </Panel>

      <div className="flex gap-3">
        <button type="submit" className="btn btn-primary" disabled={submit.pending}>
          {submit.pending ? 'Checking…' : 'Preview import'}
        </button>
        <CancelButton id={job.id} onDone={onSaved} />
      </div>
    </form>
  );
}

function PreviewStep({
  job,
  onChanged,
  onRemap,
}: {
  readonly job: ImportJob;
  readonly onChanged: () => void;
  readonly onRemap: () => void;
}) {
  const p = job.preview;
  const submit = useSubmit();
  if (!p) return <LoadingBlock />;
  const importable = p.valid;
  return (
    <div className="grid gap-6">
      <Panel title="Preview" description="Nothing has been imported yet.">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Rows" value={formatNumber(p.total)} />
          <Stat label="Valid" value={formatNumber(p.valid)} tone="live" />
          <Stat
            label="Invalid"
            value={formatNumber(p.invalid)}
            tone={p.invalid ? 'warn' : 'neutral'}
          />
          <Stat label="Match existing" value={formatNumber(p.matchesExisting)} />
          <Stat label="Repeated in file" value={formatNumber(p.duplicatesInFile)} />
          <Stat
            label="Missing phone"
            value={formatNumber(p.missingRequired)}
            tone={p.missingRequired ? 'warn' : 'neutral'}
          />
          <Stat
            label="No consent basis"
            value={formatNumber(p.noConsentBasis)}
            tone={p.noConsentBasis ? 'warn' : 'neutral'}
          />
          <Stat label="Suppressed" value={formatNumber(p.suppressed)} />
        </div>
        <ul className="mt-5 grid gap-1.5 text-sm text-muted">
          <li>
            Existing contacts are updated only where a field is empty; differences are reported,
            never overwritten.
          </li>
          <li>Uncertain matches go to the duplicates review instead of being merged.</li>
          {p.noConsentBasis ? (
            <li>
              {formatNumber(p.noConsentBasis)} rows will be imported but cannot be called until they
              get a consent basis.
            </li>
          ) : null}
        </ul>
        {p.sampleErrors.length > 0 ? (
          <div className="mt-5">
            <h3 className="text-sm font-bold text-ink">Rows that will fail</h3>
            <ul className="mt-2 grid gap-1 text-sm">
              {p.sampleErrors.map((e) => (
                <li key={e.row} className="text-ink-2">
                  Row {e.row}: {e.reason}
                </li>
              ))}
            </ul>
            {p.invalid > p.sampleErrors.length ? (
              <p className="mt-1 text-[13px] text-muted">
                The full list is in the error report after the import.
              </p>
            ) : null}
          </div>
        ) : null}
      </Panel>
      <FormAlert message={submit.error} />
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="btn btn-primary"
          disabled={submit.pending || importable === 0}
          onClick={() =>
            void submit.run(() => api.post(`/imports/${job.id}/confirm`)).then(() => onChanged())
          }
        >
          {submit.pending ? 'Starting…' : `Import ${formatNumber(importable)} rows`}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onRemap}>
          Change mapping
        </button>
        <CancelButton id={job.id} onDone={onChanged} />
      </div>
    </div>
  );
}

function Progress({ job }: { readonly job: ImportJob }) {
  const percent = job.counts.total
    ? Math.round((job.counts.processed / job.counts.total) * 100)
    : 0;
  return (
    <Panel title="Importing">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-3 overflow-hidden rounded-full bg-soft"
      >
        <div
          className="h-full rounded-full bg-[var(--nv-grad)] transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-3 text-sm text-muted">
        {formatNumber(job.counts.processed)} of {formatNumber(job.counts.total)} rows · you can
        leave this page.
      </p>
    </Panel>
  );
}

function Result({ job }: { readonly job: ImportJob }) {
  const download = useSubmit();
  const hasProblems = job.counts.failed + job.counts.review > 0;
  return (
    <Panel title="Import complete">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Imported" value={formatNumber(job.counts.succeeded)} tone="live" />
        <Stat label="Matched existing" value={formatNumber(job.counts.duplicates)} />
        <Stat
          label="Needs review"
          value={formatNumber(job.counts.review)}
          tone={job.counts.review ? 'warn' : 'neutral'}
        />
        <Stat
          label="Failed"
          value={formatNumber(job.counts.failed)}
          tone={job.counts.failed ? 'warn' : 'neutral'}
        />
      </div>
      <FormAlert message={download.error} />
      <div className="mt-5 flex flex-wrap gap-3">
        <Link href="/app/leads" className="btn btn-primary btn-sm">
          View leads
        </Link>
        {job.counts.review > 0 ? (
          <Link href="/app/data-sources/review" className="btn btn-secondary btn-sm">
            Review possible duplicates
          </Link>
        ) : null}
        {hasProblems && !job.purgedAt ? (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={download.pending}
            onClick={() =>
              void download.run(async () => {
                const { blob, fileName } = await api.download(`/imports/${job.id}/error-report`);
                saveBlob(blob, fileName ?? 'import-errors.csv');
              })
            }
          >
            Download error report
          </button>
        ) : null}
      </div>
      <p className="mt-4 text-[13px] text-muted">
        The uploaded file and its row data are deleted 30 days after the import.
      </p>
    </Panel>
  );
}

function CancelButton({ id, onDone }: { readonly id: string; readonly onDone: () => void }) {
  const submit = useSubmit();
  return (
    <button
      type="button"
      className="btn btn-secondary"
      disabled={submit.pending}
      onClick={() => {
        if (!window.confirm('Cancel this import? Nothing will be imported.')) return;
        void submit.run(() => api.post(`/imports/${id}/cancel`)).then((ok) => ok && onDone());
      }}
    >
      Cancel import
    </button>
  );
}
