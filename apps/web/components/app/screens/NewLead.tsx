'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { CONSENT_BASES, CONSENT_LABELS, type ConsentBasis } from '@/lib/api/types';
import { api } from '@/lib/app/api';
import { useSubmit } from '@/lib/app/use-submit';
import { Field, FormAlert, PageHeader, Panel, SelectField } from '../ui';

/** PRD FR-18 / FR-130: one lead by hand, through the same validation and dedupe as imports. */
export function NewLead() {
  const router = useRouter();
  const submit = useSubmit();
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    email: '',
    company: '',
    jobTitle: '',
    city: '',
    preferredLanguage: '',
    consentBasis: '',
    consentAt: '',
    consentSource: '',
    consentReference: '',
  });
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    let id = '';
    const ok = await submit.run(async () => {
      const created = await api.post<{ id: string }>('/leads', {
        fullName: form.fullName || null,
        phone: form.phone,
        email: form.email || null,
        company: form.company || null,
        jobTitle: form.jobTitle || null,
        city: form.city || null,
        preferredLanguage: form.preferredLanguage || null,
        consentBasis: (form.consentBasis || null) as ConsentBasis | null,
        consentAt: form.consentAt ? new Date(form.consentAt).toISOString() : null,
        consentSource: form.consentSource || null,
        consentReference: form.consentReference || null,
      });
      id = created.id;
    });
    if (ok) router.push(`/app/leads/${id}`);
  };

  return (
    <div className="grid gap-8">
      <div>
        <Link href="/app/leads" className="text-sm font-semibold text-accent hover:underline">
          ← All leads
        </Link>
        <div className="mt-3">
          <PageHeader
            title="Add a lead"
            description="Numbers without a country code are treated as Indian (+91)."
          />
        </div>
      </div>
      <form onSubmit={(e) => void onSubmit(e)} className="grid gap-6">
        <FormAlert message={submit.error} />
        <Panel title="Contact">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="lead-name"
              label="Name"
              required
              maxLength={200}
              value={form.fullName}
              onChange={set('fullName')}
            />
            <Field
              id="lead-phone"
              label="Phone"
              required
              inputMode="tel"
              autoComplete="off"
              value={form.phone}
              onChange={set('phone')}
            />
            <Field
              id="lead-email"
              label="Email"
              type="email"
              value={form.email}
              onChange={set('email')}
            />
            <Field
              id="lead-company"
              label="Company"
              value={form.company}
              onChange={set('company')}
            />
            <Field
              id="lead-title"
              label="Job title"
              value={form.jobTitle}
              onChange={set('jobTitle')}
            />
            <Field id="lead-city" label="City" value={form.city} onChange={set('city')} />
            <Field
              id="lead-language"
              label="Preferred language"
              value={form.preferredLanguage}
              onChange={set('preferredLanguage')}
            />
          </div>
        </Panel>
        <Panel
          title="Consent"
          description="Without a consent basis the lead is saved but never called (PRD FR-16)."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              id="lead-consent"
              label="Consent basis"
              value={form.consentBasis}
              onChange={(value) => setForm((f) => ({ ...f, consentBasis: value }))}
              options={[
                { value: '', label: 'None' },
                ...CONSENT_BASES.map((b) => ({ value: b, label: CONSENT_LABELS[b] })),
              ]}
            />
            <Field
              id="lead-consent-at"
              label="When the inquiry or consent was given"
              type="datetime-local"
              value={form.consentAt}
              onChange={set('consentAt')}
            />
            <Field
              id="lead-consent-source"
              label="Evidence source"
              placeholder="e.g. Website form"
              value={form.consentSource}
              onChange={set('consentSource')}
            />
            <Field
              id="lead-consent-ref"
              label={
                form.consentBasis === 'REGISTERED_CONSENT'
                  ? 'Operator consent reference (required)'
                  : 'Reference'
              }
              value={form.consentReference}
              onChange={set('consentReference')}
            />
          </div>
        </Panel>
        <div className="flex gap-3">
          <button type="submit" className="btn btn-primary" disabled={submit.pending}>
            {submit.pending ? 'Saving…' : 'Save lead'}
          </button>
          <Link href="/app/leads" className="btn btn-secondary">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
