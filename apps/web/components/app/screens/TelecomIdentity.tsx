'use client';

import { useState, type FormEvent } from 'react';
import {
  BUSINESS_SECTORS,
  SECTOR_LABELS,
  type BusinessSector,
  type TelecomIdentity as Identity,
  type TelecomIdentityStatus,
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

const STATUS: Record<
  TelecomIdentityStatus,
  { label: string; tone: 'live' | 'warn' | 'accent' | 'neutral' }
> = {
  UNVERIFIED: { label: 'Not verified', tone: 'warn' },
  PENDING_REVIEW: { label: 'Waiting for Nivomi review', tone: 'accent' },
  VERIFIED: { label: 'Verified', tone: 'live' },
  EXPIRED: { label: 'Expired', tone: 'warn' },
  REVOKED: { label: 'Revoked', tone: 'warn' },
};

const dateOnly = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

/** PRD FR-9–FR-13: registered-sender details and caller numbers. Calls need VERIFIED. */
export function TelecomIdentity() {
  const { can } = useSession();
  const identity = useResource<Identity>('/telecom-identity');
  if (identity.error && !identity.data) {
    return <ErrorBlock message={identity.error} onRetry={identity.reload} />;
  }
  if (!identity.data) return <LoadingBlock label="Loading telecom identity" />;
  const data = identity.data;
  const status = STATUS[data.effectiveStatus];
  const editable = can('telecom.manage');

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Telecom identity"
        description="Indian rules require a registered sender calling from declared 140xx or 1601xx numbers. Nothing is dialled until Nivomi verifies these details."
        actions={<Badge tone={status.tone}>{status.label}</Badge>}
      />
      {data.effectiveStatus !== 'VERIFIED' ? (
        <Notice tone="warn">
          Calling is blocked until this identity is verified
          {data.statusReason ? ` (${data.statusReason})` : ''}.
        </Notice>
      ) : null}
      {data.expiringSoon && data.selfCertificationExpiresAt ? (
        <Notice tone="warn">
          The annual self-certification expires on {formatDateTime(data.selfCertificationExpiresAt)}
          . Update it before then to keep calling.
        </Notice>
      ) : null}
      <DetailsPanel identity={data} editable={editable} onSaved={identity.reload} />
      <NumbersPanel identity={data} editable={editable} onChanged={identity.reload} />
    </div>
  );
}

function DetailsPanel({
  identity,
  editable,
  onSaved,
}: {
  readonly identity: Identity;
  readonly editable: boolean;
  readonly onSaved: () => void;
}) {
  const save = useSubmit();
  const submitForReview = useSubmit();
  const [form, setForm] = useState({
    legalName: identity.legalName ?? '',
    dltEntityId: identity.dltEntityId ?? '',
    telemarketerName: identity.telemarketerName ?? '',
    telemarketerRegistrationId: identity.telemarketerRegistrationId ?? '',
    sector: identity.sector ?? '',
    a2pDeclarationReference: identity.a2pDeclarationReference ?? '',
    a2pDeclaredAt: dateOnly(identity.a2pDeclaredAt),
    selfCertifiedAt: dateOnly(identity.selfCertifiedAt),
  });
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const ok = await save.run(() =>
      api.put('/telecom-identity', {
        legalName: form.legalName || null,
        dltEntityId: form.dltEntityId || null,
        telemarketerName: form.telemarketerName || null,
        telemarketerRegistrationId: form.telemarketerRegistrationId || null,
        sector: (form.sector || null) as BusinessSector | null,
        a2pDeclarationReference: form.a2pDeclarationReference || null,
        a2pDeclaredAt: form.a2pDeclaredAt ? new Date(form.a2pDeclaredAt).toISOString() : null,
        selfCertifiedAt: form.selfCertifiedAt ? new Date(form.selfCertifiedAt).toISOString() : null,
      }),
    );
    if (ok) onSaved();
  };

  return (
    <Panel
      title="Registered sender"
      description={
        editable && identity.status === 'VERIFIED'
          ? 'Changing anything here sends the identity back for verification, and calling stops until then.'
          : 'DLT registration, telemarketer and the automated-calling (A2P) declaration.'
      }
    >
      <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <FormAlert message={save.error ?? submitForReview.error} />
        </div>
        <fieldset disabled={!editable} className="contents">
          <Field
            id="legal-name"
            label="Legal name"
            value={form.legalName}
            onChange={set('legalName')}
          />
          <Field
            id="dlt-id"
            label="DLT entity ID"
            value={form.dltEntityId}
            onChange={set('dltEntityId')}
          />
          <Field
            id="tm-name"
            label="Telemarketer"
            value={form.telemarketerName}
            onChange={set('telemarketerName')}
          />
          <Field
            id="tm-id"
            label="Telemarketer registration ID"
            value={form.telemarketerRegistrationId}
            onChange={set('telemarketerRegistrationId')}
          />
          <SelectField
            id="sector"
            label="Sector"
            value={form.sector}
            disabled={!editable}
            onChange={(sector) => setForm((f) => ({ ...f, sector }))}
            options={[
              { value: '', label: 'Choose a sector' },
              ...BUSINESS_SECTORS.map((s) => ({ value: s, label: SECTOR_LABELS[s] })),
            ]}
            hint="Decides the number series for service calls and which DND categories apply."
          />
          <Field
            id="a2p-ref"
            label="A2P declaration reference"
            value={form.a2pDeclarationReference}
            onChange={set('a2pDeclarationReference')}
          />
          <Field
            id="a2p-date"
            label="A2P declared on"
            type="date"
            value={form.a2pDeclaredAt}
            onChange={set('a2pDeclaredAt')}
          />
          <Field
            id="self-cert"
            label="Self-certified on"
            type="date"
            value={form.selfCertifiedAt}
            onChange={set('selfCertifiedAt')}
            hint="Renewed every year."
          />
        </fieldset>
        {editable ? (
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button type="submit" className="btn btn-primary btn-sm" disabled={save.pending}>
              {save.pending ? 'Saving…' : 'Save details'}
            </button>
            {identity.status === 'UNVERIFIED' ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={submitForReview.pending}
                onClick={() =>
                  void submitForReview
                    .run(() => api.post('/telecom-identity/submit'))
                    .then((ok) => {
                      if (ok) onSaved();
                    })
                }
              >
                Submit for verification
              </button>
            ) : null}
          </div>
        ) : null}
      </form>
    </Panel>
  );
}

function NumbersPanel({
  identity,
  editable,
  onChanged,
}: {
  readonly identity: Identity;
  readonly editable: boolean;
  readonly onChanged: () => void;
}) {
  const add = useSubmit();
  const remove = useSubmit();
  const [phone, setPhone] = useState('');
  const [purpose, setPurpose] = useState('PROMOTIONAL');
  const [declared, setDeclared] = useState(true);

  const onAdd = async (event: FormEvent) => {
    event.preventDefault();
    const ok = await add.run(() =>
      api.post('/telecom-identity/numbers', { phone, purpose, a2pDeclared: declared }),
    );
    if (ok) {
      setPhone('');
      onChanged();
    }
  };

  const series = identity.permittedSeries.map((s) => `${s.prefix}xx`).join(', ');
  return (
    <Panel
      title="Caller numbers"
      description={`Promotional calls use 140xx numbers; service calls use 1601xx (1600xx for banking and insurance). Accepted series: ${series}.`}
    >
      {identity.numbers.length === 0 ? (
        <p className="text-sm text-muted">No caller numbers yet.</p>
      ) : (
        <ul className="grid gap-2">
          {identity.numbers.map((n) => (
            <li
              key={n.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-line px-4 py-2.5 text-sm"
            >
              <span>
                <span className="font-semibold text-ink">{formatPhone(n.phone)}</span>{' '}
                <span className="text-muted">
                  · {n.series}xx · {n.purpose.toLowerCase()} ·{' '}
                  {n.a2pDeclared ? 'A2P declared' : 'A2P not declared'}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <Badge tone={n.status === 'ACTIVE' ? 'live' : 'warn'}>
                  {n.status.toLowerCase()}
                  {n.statusReason ? ` · ${n.statusReason}` : ''}
                </Badge>
                {editable && n.status !== 'RETIRED' ? (
                  <button
                    type="button"
                    className="text-sm font-semibold text-accent hover:underline"
                    disabled={remove.pending}
                    onClick={() =>
                      void remove
                        .run(() => api.del(`/telecom-identity/numbers/${n.id}`))
                        .then((ok) => {
                          if (ok) onChanged();
                        })
                    }
                  >
                    Remove
                  </button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      {editable ? (
        <form
          onSubmit={(e) => void onAdd(e)}
          className="mt-6 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        >
          <div className="sm:col-span-3">
            <FormAlert message={add.error ?? remove.error} />
          </div>
          <Field
            id="caller-number"
            label="Number"
            required
            inputMode="tel"
            placeholder="140 123 4567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <SelectField
            id="caller-purpose"
            label="Purpose"
            value={purpose}
            onChange={setPurpose}
            options={[
              { value: 'PROMOTIONAL', label: 'Promotional' },
              { value: 'SERVICE', label: 'Service' },
            ]}
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={add.pending}>
            {add.pending ? 'Adding…' : 'Add number'}
          </button>
          <label className="flex items-center gap-2 text-sm text-ink sm:col-span-3">
            <input
              type="checkbox"
              checked={declared}
              onChange={(e) => setDeclared(e.target.checked)}
            />
            This number is in our A2P (automated calling) declaration to the operator
          </label>
        </form>
      ) : null}
    </Panel>
  );
}
