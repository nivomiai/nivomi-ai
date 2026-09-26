'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import {
  CONSENT_LABELS,
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  SOURCE_LABELS,
  type LeadDetail as Lead,
  type LeadStatus,
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
import { statusTone } from './Leads';

const FIELD_LABELS: Record<string, string> = {
  fullName: 'Name',
  firstName: 'First name',
  lastName: 'Last name',
  email: 'Email',
  phoneE164: 'Phone',
  companyId: 'Company',
  jobTitle: 'Job title',
  city: 'City',
  state: 'State',
  country: 'Country',
  preferredLanguage: 'Language',
  consentBasis: 'Consent basis',
  owner: 'Owner',
};

export function LeadDetail({ id }: { readonly id: string }) {
  const { can } = useSession();
  const lead = useResource<Lead>(`/leads/${id}`);

  if (lead.error && !lead.data) {
    return (
      <div className="grid gap-6">
        <PageHeader title="Lead" />
        <ErrorBlock message={lead.error} onRetry={lead.reload} />
      </div>
    );
  }
  if (!lead.data) return <LoadingBlock label="Loading lead" />;
  const data = lead.data;
  const hubspot = data.sources.find((s) => s.provider === 'HUBSPOT' && s.objectType === 'contact');

  return (
    <div className="grid gap-8">
      <div>
        <Link href="/app/leads" className="text-sm font-semibold text-accent hover:underline">
          ← All leads
        </Link>
        <div className="mt-3">
          <PageHeader
            title={data.contact.fullName}
            description={
              [data.contact.jobTitle, data.contact.company].filter(Boolean).join(' · ') || undefined
            }
            actions={
              <Badge tone={statusTone(data.status)}>{LEAD_STATUS_LABELS[data.status]}</Badge>
            }
          />
        </div>
      </div>

      {data.suppressed ? (
        <Notice tone="warn">
          This number is on the suppression list (
          {data.suppressed.source.toLowerCase().replace(/_/g, ' ')}
          ). Nivomi will never call it.
        </Notice>
      ) : null}
      {!data.consentBasis ? (
        <Notice tone="warn">
          No consent basis is recorded, so this lead cannot be called. Add one by editing the lead
          or re-importing it with consent evidence.
        </Notice>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="grid content-start gap-6">
          <ContactPanel lead={data} canEdit={can('leads.write')} onSaved={lead.reload} />
          <Panel title="Timeline" description="Status and field changes, newest first.">
            {data.timeline.length === 0 ? (
              <p className="text-sm text-muted">No activity yet.</p>
            ) : (
              <ol className="grid gap-3">
                {data.timeline.map((entry, index) => (
                  <li
                    key={`${entry.at}-${index}`}
                    className="rounded-[12px] border border-line px-4 py-3"
                  >
                    <p className="text-sm text-ink">
                      {entry.type === 'status'
                        ? entry.from
                          ? `Status ${LEAD_STATUS_LABELS[entry.from as LeadStatus] ?? entry.from} → ${LEAD_STATUS_LABELS[entry.to as LeadStatus] ?? entry.to}`
                          : `Created as ${LEAD_STATUS_LABELS[entry.to as LeadStatus] ?? entry.to}`
                        : `${FIELD_LABELS[entry.field ?? ''] ?? entry.field} changed${entry.from ? ` from “${entry.from}”` : ''}${entry.to ? ` to “${entry.to}”` : ''}`}
                    </p>
                    <p className="mt-0.5 text-[13px] text-muted">
                      {formatDateTime(entry.at)} · {entry.source.toLowerCase().replace(/_/g, ' ')}
                      {entry.reason ? ` · ${entry.reason}` : ''}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>

        <div className="grid content-start gap-6">
          {can('leads.write') ? <StatusPanel lead={data} onSaved={lead.reload} /> : null}
          <Panel title="Consent">
            {data.consentBasis ? (
              <dl className="grid gap-2 text-sm">
                <Row label="Basis" value={CONSENT_LABELS[data.consentBasis]} />
                <Row
                  label="Given"
                  value={data.consentEvidence?.at ? formatDateTime(data.consentEvidence.at) : '—'}
                />
                <Row label="Evidence source" value={data.consentEvidence?.source ?? '—'} />
                <Row label="Reference" value={data.consentEvidence?.reference ?? '—'} />
                {data.consentEvidence?.attestedByUserId ? (
                  <Row label="Attested" value="By the importing member" />
                ) : null}
              </dl>
            ) : (
              <p className="text-sm text-muted">None recorded.</p>
            )}
          </Panel>
          <Panel title="Sources">
            <dl className="grid gap-2 text-sm">
              <Row label="Created from" value={SOURCE_LABELS[data.source]} />
              <Row label="Added" value={formatDateTime(data.createdAt)} />
              {hubspot ? (
                <Row
                  label="HubSpot"
                  value={`Contact ${hubspot.externalId}${hubspot.connectionStatus === 'DISCONNECTED' ? ' · Disconnected' : ''}${hubspot.lastSyncedAt ? ` · last synced ${formatDateTime(hubspot.lastSyncedAt)}` : ''}`}
                />
              ) : null}
              {data.crmDetails?.hubspotLeadName ? (
                <Row
                  label="HubSpot lead"
                  value={[data.crmDetails.hubspotLeadName, data.crmDetails.hubspotLeadLabel]
                    .filter(Boolean)
                    .join(' · ')}
                />
              ) : null}
              {data.score ? <Row label="Lead score" value={data.score} /> : null}
              <Row label="Owner" value={data.owner?.name ?? 'Unassigned'} />
            </dl>
          </Panel>
          {Object.keys(data.contact.customFields).length > 0 ? (
            <Panel title="Custom fields">
              <dl className="grid gap-2 text-sm">
                {Object.entries(data.contact.customFields).map(([key, value]) => (
                  <Row
                    key={key}
                    label={key === 'preferredCallTime' ? 'Preferred call time' : key}
                    value={value}
                  />
                ))}
              </dl>
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line/60 pb-2 last:border-0 last:pb-0">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-semibold break-all text-ink">{value}</dd>
    </div>
  );
}

function StatusPanel({ lead, onSaved }: { readonly lead: Lead; readonly onSaved: () => void }) {
  const [status, setStatus] = useState<LeadStatus>(lead.status);
  const [reason, setReason] = useState('');
  const submit = useSubmit();
  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    // useSubmit blocks double clicks; the API records one transition per request.
    const ok = await submit.run(() =>
      api.post(`/leads/${lead.id}/status`, { status, reason: reason || null }),
    );
    if (ok) {
      setReason('');
      onSaved();
    }
  };
  return (
    <Panel title="Change status">
      <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4">
        <FormAlert message={submit.error} />
        <SelectField
          id="lead-status-change"
          label="Status"
          value={status}
          onChange={(value) => setStatus(value as LeadStatus)}
          options={LEAD_STATUSES.map((s) => ({ value: s, label: LEAD_STATUS_LABELS[s] }))}
        />
        <Field
          id="lead-status-reason"
          label="Reason (optional)"
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <button
          type="submit"
          className="btn btn-primary btn-sm"
          disabled={submit.pending || status === lead.status}
        >
          {submit.pending ? 'Saving…' : 'Save status'}
        </button>
      </form>
    </Panel>
  );
}

function ContactPanel({
  lead,
  canEdit,
  onSaved,
}: {
  readonly lead: Lead;
  readonly canEdit: boolean;
  readonly onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const c = lead.contact;
  const [form, setForm] = useState({
    fullName: c.fullName,
    phone: c.phone ?? '',
    email: c.email ?? '',
    company: c.company ?? '',
    jobTitle: c.jobTitle ?? '',
    city: c.city ?? '',
    preferredLanguage: c.preferredLanguage ?? '',
  });
  const submit = useSubmit();
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const ok = await submit.run(() =>
      api.patch(`/leads/${lead.id}`, {
        fullName: form.fullName,
        phone: form.phone,
        email: form.email || null,
        company: form.company || null,
        jobTitle: form.jobTitle || null,
        city: form.city || null,
        preferredLanguage: form.preferredLanguage || null,
      }),
    );
    if (ok) {
      setEditing(false);
      onSaved();
    }
  };

  if (!editing) {
    return (
      <Panel title="Contact">
        <dl className="grid gap-2 text-sm">
          <Row label="Phone" value={formatPhone(c.phone)} />
          <Row label="Email" value={c.email ?? '—'} />
          <Row label="Company" value={c.company ?? '—'} />
          <Row
            label="City"
            value={[c.city, c.state, c.country].filter(Boolean).join(', ') || '—'}
          />
          <Row label="Language" value={c.preferredLanguage ?? '—'} />
        </dl>
        {canEdit ? (
          <button
            type="button"
            className="btn btn-secondary btn-sm mt-5"
            onClick={() => setEditing(true)}
          >
            Edit details
          </button>
        ) : null}
      </Panel>
    );
  }
  return (
    <Panel title="Edit contact" description="Changes are recorded in the timeline.">
      <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <FormAlert message={submit.error} />
        </div>
        <Field
          id="edit-name"
          label="Name"
          required
          value={form.fullName}
          onChange={set('fullName')}
        />
        <Field id="edit-phone" label="Phone" required value={form.phone} onChange={set('phone')} />
        <Field
          id="edit-email"
          label="Email"
          type="email"
          value={form.email}
          onChange={set('email')}
        />
        <Field id="edit-company" label="Company" value={form.company} onChange={set('company')} />
        <Field id="edit-title" label="Job title" value={form.jobTitle} onChange={set('jobTitle')} />
        <Field id="edit-city" label="City" value={form.city} onChange={set('city')} />
        <Field
          id="edit-language"
          label="Preferred language"
          value={form.preferredLanguage}
          onChange={set('preferredLanguage')}
        />
        <div className="flex gap-2 sm:col-span-2">
          <button type="submit" className="btn btn-primary btn-sm" disabled={submit.pending}>
            {submit.pending ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setEditing(false)}
          >
            Cancel
          </button>
        </div>
      </form>
    </Panel>
  );
}
