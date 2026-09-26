'use client';

import Link from 'next/link';
import { type FormEvent, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { track } from '@/lib/site/analytics';
import { siteConfig } from '@/lib/site/config';
import { cx } from '@/lib/site/cx';
import {
  LEAD_VOLUME_OPTIONS,
  type LeadErrors,
  type LeadField,
  type LeadInput,
  type LeadIntent,
  buildLeadMessage,
  createContactChannelClient,
  firstInvalidField,
  leadEmailSubject,
  mailtoUrl,
  validateLead,
} from '@/lib/site/lead-capture';
import { Icon } from './primitives';

type Status = 'idle' | 'submitting' | 'success' | 'error';

type Values = Record<LeadField, string>;

const EMPTY: Values = { name: '', email: '', company: '', phone: '', leadVolume: '', message: '' };

function subscribeHash(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}
const readHash = (): string => window.location.hash;
const serverHash = (): string => '';

function openInNewTab(url: string): Window | null {
  const opened = window.open(url, '_blank');
  if (opened) opened.opener = null;
  return opened;
}

/**
 * Lead capture form. Submits through a `LeadCaptureClient`; today that client hands the enquiry
 * to Nivomi's WhatsApp sales channel (email fallback). Nothing is sent to a Nivomi server.
 */
export function LeadForm({
  fixedIntent,
  interest,
  placement,
}: {
  /** Set on Coming Soon pages; otherwise the visitor chooses (and `#get-started` preselects). */
  readonly fixedIntent?: LeadIntent;
  readonly interest?: string;
  readonly placement: string;
}) {
  const formId = useId();
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<LeadErrors>({});
  const [status, setStatus] = useState<Status>('idle');
  const [chosenIntent, setChosenIntent] = useState<LeadIntent | null>(null);
  const started = useRef(false);
  const fieldRefs = useRef<Partial<Record<LeadField, HTMLElement | null>>>({});

  const hash = useSyncExternalStore(subscribeHash, readHash, serverHash);
  const intent: LeadIntent =
    fixedIntent ?? chosenIntent ?? (hash === '#get-started' ? 'early-access' : 'demo');

  const client = useMemo(
    () =>
      createContactChannelClient({
        whatsappNumber: siteConfig.contact.whatsapp,
        openWindow: openInNewTab,
      }),
    [],
  );

  const lead: LeadInput = {
    intent,
    ...(interest ? { interest } : {}),
    ...values,
  };
  const emailHref = mailtoUrl(
    siteConfig.contact.email,
    leadEmailSubject(lead),
    buildLeadMessage(lead),
  );

  const update = (field: LeadField, value: string) => {
    if (!started.current) {
      started.current = true;
      track('contact_form_started', { placement });
    }
    setValues((current) => ({ ...current, [field]: value }));
    if (errors[field]) {
      setErrors((current) => {
        const next = { ...current };
        delete next[field];
        return next;
      });
    }
    if (status === 'error') setStatus('idle');
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status === 'submitting') return;
    const found = validateLead(lead);
    setErrors(found);
    const first = firstInvalidField(found);
    if (first) {
      fieldRefs.current[first]?.focus();
      return;
    }
    setStatus('submitting');
    try {
      await client.submit(lead);
      track('contact_form_submitted', { placement, intent });
      setStatus('success');
    } catch {
      setStatus('error');
    }
  };

  if (status === 'success') {
    return (
      <div role="status" className="card-nv p-8 text-center" aria-live="polite">
        <span className="mx-auto inline-grid size-12 place-items-center rounded-full bg-live-soft text-live">
          <Icon name="i-check" className="size-6" />
        </span>
        <h3 className="mt-5 text-xl text-ink">Thanks — your details are ready to send</h3>
        <p className="mt-3 text-muted">
          We opened WhatsApp in a new tab with your details filled in. Press send there and our team
          will reply. Prefer email?{' '}
          <a className="font-semibold text-accent underline underline-offset-4" href={emailHref}>
            Send it by email instead
          </a>
          .
        </p>
        <button
          type="button"
          className="btn btn-secondary btn-sm mt-6"
          onClick={() => {
            setValues(EMPTY);
            setStatus('idle');
            started.current = false;
          }}
        >
          Send another enquiry
        </button>
      </div>
    );
  }

  const field = (name: LeadField) => ({
    id: `${formId}-${name}`,
    name,
    value: values[name],
    'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby': errors[name] ? `${formId}-${name}-error` : undefined,
    ref: (el: HTMLElement | null) => {
      fieldRefs.current[name] = el;
    },
  });

  const inputClass = (name: LeadField) =>
    cx(
      'mt-1.5 w-full rounded-[12px] border bg-surface px-4 py-3 text-[15px] text-ink placeholder:text-muted/70 transition-colors focus:border-pink focus:outline-none focus-visible:ring-4 focus-visible:ring-accent-tint',
      errors[name] ? 'border-[#d33] dark:border-[#ff7a7a]' : 'border-line',
    );

  const errorText = (name: LeadField) =>
    errors[name] ? (
      <p
        id={`${formId}-${name}-error`}
        className="mt-1.5 text-sm text-[#b42318] dark:text-[#ff9b9b]"
      >
        {errors[name]}
      </p>
    ) : null;

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <form
      noValidate
      aria-labelledby={`${formId}-title`}
      className="card-nv p-6 sm:p-8"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <h3 id={`${formId}-title`} className="text-xl text-ink">
        {fixedIntent === 'coming-soon' ? 'Get notified' : 'Tell us about your team'}
      </h3>
      <p className="mt-2 text-sm text-muted">
        We use these details only to reply to your enquiry. See our{' '}
        <Link href="/privacy" className="font-semibold text-accent underline underline-offset-4">
          privacy notice
        </Link>
        .
      </p>

      {!fixedIntent && (
        <fieldset className="mt-6">
          <legend className="text-sm font-semibold text-ink">I would like to</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {(
              [
                ['demo', 'Book a demo'],
                ['early-access', 'Get started (early access)'],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className={cx(
                  'flex cursor-pointer items-center gap-3 rounded-[12px] border px-4 py-3 text-[15px] font-medium transition-colors',
                  intent === value
                    ? 'border-pink bg-accent-soft text-ink'
                    : 'border-line text-ink-2 hover:border-line-hover',
                )}
              >
                <input
                  type="radio"
                  name="intent"
                  value={value}
                  checked={intent === value}
                  onChange={() => setChosenIntent(value)}
                  className="accent-[var(--nv-pink)]"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {hasErrors && (
        <p role="alert" className="mt-6 rounded-[12px] bg-warn-soft px-4 py-3 text-sm text-warn">
          Please check the highlighted fields.
        </p>
      )}

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor={`${formId}-name`} className="text-sm font-semibold text-ink">
            Name
          </label>
          <input
            {...field('name')}
            type="text"
            autoComplete="name"
            required
            className={inputClass('name')}
            onChange={(e) => update('name', e.target.value)}
          />
          {errorText('name')}
        </div>
        <div>
          <label htmlFor={`${formId}-email`} className="text-sm font-semibold text-ink">
            Work email
          </label>
          <input
            {...field('email')}
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            className={inputClass('email')}
            onChange={(e) => update('email', e.target.value)}
          />
          {errorText('email')}
        </div>
        <div>
          <label htmlFor={`${formId}-company`} className="text-sm font-semibold text-ink">
            Company
          </label>
          <input
            {...field('company')}
            type="text"
            autoComplete="organization"
            required
            className={inputClass('company')}
            onChange={(e) => update('company', e.target.value)}
          />
          {errorText('company')}
        </div>
        <div>
          <label htmlFor={`${formId}-phone`} className="text-sm font-semibold text-ink">
            Phone
          </label>
          <input
            {...field('phone')}
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            required
            placeholder="+91 98765 43210"
            className={inputClass('phone')}
            onChange={(e) => update('phone', e.target.value)}
          />
          {errorText('phone')}
        </div>
        {fixedIntent !== 'coming-soon' && (
          <div className="sm:col-span-2">
            <label htmlFor={`${formId}-leadVolume`} className="text-sm font-semibold text-ink">
              Monthly lead volume <span className="font-normal text-muted">(optional)</span>
            </label>
            <select
              {...field('leadVolume')}
              className={inputClass('leadVolume')}
              onChange={(e) => update('leadVolume', e.target.value)}
            >
              {LEAD_VOLUME_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {errorText('leadVolume')}
          </div>
        )}
        <div className="sm:col-span-2">
          <label htmlFor={`${formId}-message`} className="text-sm font-semibold text-ink">
            Message <span className="font-normal text-muted">(optional)</span>
          </label>
          <textarea
            {...field('message')}
            rows={4}
            maxLength={1000}
            className={cx(inputClass('message'), 'resize-y')}
            onChange={(e) => update('message', e.target.value)}
          />
          {errorText('message')}
        </div>
      </div>

      {status === 'error' && (
        <div
          role="alert"
          className="mt-6 rounded-[12px] border border-line bg-soft px-4 py-3 text-sm text-ink-2"
        >
          We couldn’t open WhatsApp — your browser may have blocked the new tab.{' '}
          <a className="font-semibold text-accent underline underline-offset-4" href={emailHref}>
            Send your details by email
          </a>{' '}
          or try again.
        </div>
      )}

      <div className="mt-7 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <button type="submit" className="btn btn-primary" disabled={status === 'submitting'}>
          {status === 'submitting'
            ? 'Opening WhatsApp…'
            : status === 'error'
              ? 'Try again'
              : 'Send enquiry'}
          <Icon name="i-arrow" className="size-4" />
        </button>
        <p className="text-xs text-muted">
          Opens WhatsApp with your details filled in ·{' '}
          <a className="underline underline-offset-2 hover:text-accent" href={emailHref}>
            or email us
          </a>
        </p>
      </div>
    </form>
  );
}
