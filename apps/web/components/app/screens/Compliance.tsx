'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import {
  CALL_CATEGORY_LABELS,
  CONSENT_LABELS,
  type CallCategory,
  type CallingControls,
  type ComplaintRecord,
  type ConsentBasis,
  type Page,
  type RuleSetSummary,
  type TelecomIdentity,
} from '@/lib/api/types';
import { api } from '@/lib/app/api';
import { formatDateTime, formatPhone } from '@/lib/app/format';
import { useSession } from '@/lib/app/session';
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
  SelectField,
} from '../ui';

/** Rule sets (FR-46), calling controls and complaint records (FR-49). */
export function Compliance() {
  const { can } = useSession();
  const ruleSets = useResource<{ items: RuleSetSummary[] }>('/compliance/rule-sets');
  const controls = useResource<CallingControls>('/compliance/controls');

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Compliance"
        description="The rules every call is checked against, and the controls that stop calling."
        actions={
          can('compliance.review') ? (
            <Link href="/app/compliance/reviews" className="btn btn-secondary btn-sm">
              Review queue
            </Link>
          ) : null
        }
      />
      {controls.data ? (
        <ControlsPanel
          controls={controls.data}
          canReview={can('compliance.review')}
          onChange={controls.reload}
        />
      ) : controls.error ? (
        <ErrorBlock message={controls.error} onRetry={controls.reload} />
      ) : null}
      {can('compliance.review') ? <ComplaintsPanel onRecorded={controls.reload} /> : null}
      {ruleSets.error && !ruleSets.data ? (
        <ErrorBlock message={ruleSets.error} onRetry={ruleSets.reload} />
      ) : !ruleSets.data ? (
        <LoadingBlock label="Loading rule sets" />
      ) : (
        ruleSets.data.items.map((r) => <RuleSetPanel key={r.id} ruleSet={r} />)
      )}
    </div>
  );
}

function ControlsPanel({
  controls,
  canReview,
  onChange,
}: {
  readonly controls: CallingControls;
  readonly canReview: boolean;
  readonly onChange: () => void;
}) {
  const submit = useSubmit();
  const { breaker, emergencyStop } = controls;
  return (
    <Panel title="Calling controls">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-[14px] border border-line p-4">
          <p className="text-xs font-bold tracking-[0.08em] text-muted uppercase">Emergency Stop</p>
          <p className="mt-1 font-semibold text-ink">
            {emergencyStop.active ? `On since ${formatDateTime(emergencyStop.at ?? '')}` : 'Off'}
          </p>
          <p className="mt-1 text-[13px] text-muted">Set and released from the Campaigns page.</p>
        </div>
        <div className="rounded-[14px] border border-line p-4">
          <p className="text-xs font-bold tracking-[0.08em] text-muted uppercase">
            Complaint breaker
          </p>
          <p className="mt-1 font-semibold text-ink">
            {breaker.tripped ? `Tripped ${formatDateTime(breaker.at ?? '')}` : 'Not tripped'}
          </p>
          <p className="mt-1 text-[13px] text-muted">
            {breaker.tripped
              ? breaker.reason
              : breaker.threshold
                ? `Trips at ${breaker.threshold.breakerThreshold} complaints in ${breaker.threshold.windowDays} days, or any operator flag.`
                : null}
          </p>
        </div>
      </div>
      {breaker.tripped ? (
        <div className="mt-4 grid gap-3">
          <Notice tone="warn">
            All calling is paused. Resuming needs an admin’s acknowledgement and then approval from
            Nivomi (Super Admin).
            {breaker.acknowledgedAt
              ? ` Acknowledged ${formatDateTime(breaker.acknowledgedAt)}; waiting for Nivomi.`
              : ''}
          </Notice>
          <FormAlert message={submit.error} />
          {canReview && !breaker.acknowledgedAt ? (
            <button
              type="button"
              className="btn btn-primary btn-sm w-fit"
              disabled={submit.pending}
              onClick={() =>
                void submit
                  .run(() => api.post('/compliance/breaker/acknowledge', {}))
                  .then((ok) => {
                    if (ok) onChange();
                  })
              }
            >
              Acknowledge the complaints
            </button>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}

function ComplaintsPanel({ onRecorded }: { readonly onRecorded: () => void }) {
  const list = useResource<Page<ComplaintRecord>>('/compliance/complaints?limit=50');
  const identity = useResource<TelecomIdentity>('/telecom-identity');
  const submit = useSubmit();
  const [form, setForm] = useState({
    kind: 'COMPLAINT',
    callerNumberId: '',
    reference: '',
    note: '',
  });
  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const ok = await submit.run(() =>
      api.post('/compliance/complaints', {
        kind: form.kind,
        callerNumberId: form.callerNumberId || null,
        reference: form.reference || null,
        note: form.note || null,
      }),
    );
    if (ok) {
      setForm({ kind: 'COMPLAINT', callerNumberId: '', reference: '', note: '' });
      list.reload();
      onRecorded();
    }
  };
  return (
    <Panel
      title="Complaints and operator flags"
      description="Recording one against a number pauses that number immediately."
    >
      <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <FormAlert message={submit.error} />
        </div>
        <SelectField
          id="complaint-kind"
          label="Type"
          value={form.kind}
          onChange={(kind) => setForm((f) => ({ ...f, kind }))}
          options={[
            { value: 'COMPLAINT', label: 'Complaint from a recipient' },
            { value: 'OPERATOR_FLAG', label: 'Operator spam flag' },
          ]}
        />
        <SelectField
          id="complaint-number"
          label="Caller number"
          value={form.callerNumberId}
          onChange={(callerNumberId) => setForm((f) => ({ ...f, callerNumberId }))}
          options={[
            { value: '', label: 'Not linked to a number' },
            ...(identity.data?.numbers ?? []).map((n) => ({
              value: n.id,
              label: formatPhone(n.phone),
            })),
          ]}
        />
        <Field
          id="complaint-reference"
          label="Reference"
          maxLength={200}
          value={form.reference}
          onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
        />
        <Field
          id="complaint-note"
          label="Note"
          maxLength={1000}
          value={form.note}
          onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
        />
        <button type="submit" className="btn btn-primary btn-sm w-fit" disabled={submit.pending}>
          {submit.pending ? 'Recording…' : 'Record'}
        </button>
      </form>
      <div className="mt-6">
        {!list.data ? null : list.data.items.length === 0 ? (
          <p className="text-sm text-muted">No complaints recorded.</p>
        ) : (
          <ul className="grid gap-2">
            {list.data.items.map((c) => (
              <li key={c.id} className="rounded-[12px] border border-line px-4 py-2.5 text-sm">
                <Badge tone="warn">
                  {c.kind === 'OPERATOR_FLAG' ? 'Operator flag' : 'Complaint'}
                </Badge>{' '}
                <span className="text-ink">
                  {formatDateTime(c.receivedAt)}
                  {c.callerNumber ? ` · ${formatPhone(c.callerNumber)}` : ''}
                  {c.reference ? ` · ${c.reference}` : ''}
                </span>
                {c.note ? <p className="mt-1 text-muted">{c.note}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

function RuleSetPanel({ ruleSet: r }: { readonly ruleSet: RuleSetSummary }) {
  return (
    <Panel
      title={`Rule set ${r.jurisdiction} v${r.version}`}
      description={`In force from ${formatDateTime(r.effectiveFrom)}${r.effectiveTo ? ` to ${formatDateTime(r.effectiveTo)}` : ''} · times in ${r.rules.timezone}`}
    >
      <div className="grid gap-5">
        {r.pendingLegalReview ? (
          <Notice tone="warn">
            <strong>Draft — pending legal review.</strong> {r.reviewNote}
          </Notice>
        ) : (
          <Badge tone="live">Approved</Badge>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="text-sm font-bold text-ink">Call types</h3>
            <ul className="mt-2 grid gap-2 text-sm">
              {(
                Object.entries(r.rules.callCategories) as [
                  CallCategory,
                  { description: string; callingWindow: { start: string; end: string } | null },
                ][]
              ).map(([category, rule]) => (
                <li key={category} className="rounded-[12px] border border-line px-4 py-2.5">
                  <p className="font-semibold text-ink">
                    {CALL_CATEGORY_LABELS[category]} ·{' '}
                    {rule.callingWindow
                      ? `${rule.callingWindow.start}–${rule.callingWindow.end}`
                      : 'no time band'}
                  </p>
                  <p className="text-muted">{rule.description}</p>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-bold text-ink">Consent and opt-out</h3>
            <ul className="mt-2 grid gap-1.5 text-sm text-ink-2">
              {(
                Object.entries(r.rules.consentBases) as [
                  ConsentBasis,
                  { validityDays: number | null },
                ][]
              ).map(([basis, rule]) => (
                <li key={basis}>
                  {CONSENT_LABELS[basis]}:{' '}
                  {rule.validityDays ? `valid ${rule.validityDays} days` : 'no fixed expiry'}
                </li>
              ))}
              <li>
                Re-consent blocked for {r.rules.optOut.reConsentBlockDays} days after an opt-out
              </li>
              <li>
                Number series: {r.rules.numberSeries.map((s) => `${s.prefix}xx`).join(', ')};
                ordinary numbers are blocked
              </li>
            </ul>
          </div>
        </div>
        <div>
          <h3 className="text-sm font-bold text-ink">Sources</h3>
          <ul className="mt-2 grid gap-1 text-[13px] text-muted">
            {r.sources.map((s) => (
              <li key={s.id}>
                <span className="font-semibold text-ink-2">{s.id}</span> {s.title}
                {s.reference.startsWith('http') ? (
                  <>
                    {' '}
                    <a
                      href={s.reference}
                      target="_blank"
                      rel="noreferrer"
                      className="text-accent underline-offset-4 hover:underline"
                    >
                      source
                    </a>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Panel>
  );
}
