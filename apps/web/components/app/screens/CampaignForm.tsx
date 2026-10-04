'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import {
  CALL_CATEGORY_LABELS,
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  type CallCategory,
  type Campaign,
  type TelecomIdentity,
} from '@/lib/api/types';
import { api } from '@/lib/app/api';
import { formatPhone } from '@/lib/app/format';
import { useResource } from '@/lib/app/use-resource';
import { useSubmit } from '@/lib/app/use-submit';
import { cx } from '@/lib/site/cx';
import {
  ErrorBlock,
  Field,
  FormAlert,
  LoadingBlock,
  Notice,
  PageHeader,
  Panel,
  SelectField,
} from '../ui';

/** `datetime-local` value ↔ ISO string, in the browser's time zone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null);

/** FR-35: create a campaign, or edit a draft. */
export function CampaignForm({ campaign }: { readonly campaign?: Campaign }) {
  const router = useRouter();
  const identity = useResource<TelecomIdentity>('/telecom-identity');
  const submit = useSubmit();
  const [form, setForm] = useState({
    name: campaign?.name ?? '',
    callCategory: campaign?.callCategory ?? 'PROMOTIONAL',
    type: campaign?.type ?? 'STATIC',
    callerNumberId: campaign?.callerNumber?.id ?? '',
    statuses: campaign?.selection.statuses ?? [],
    windowStart: campaign?.windowStart ?? '10:00',
    windowEnd: campaign?.windowEnd ?? '19:00',
    startsAt: toLocalInput(campaign?.startsAt ?? null),
    endsAt: toLocalInput(campaign?.endsAt ?? null),
    budgetMinutes: String(campaign?.budgetMinutes ?? 60),
    maxConcurrentCalls: String(campaign?.maxConcurrentCalls ?? 2),
    maxCallsPerHour: String(campaign?.maxCallsPerHour ?? 60),
    maxAttempts: String(campaign?.maxAttempts ?? 3),
    retryIntervalHours: String((campaign?.retryIntervalMinutes ?? 240) / 60),
    maxAttemptsPerDay: String(campaign?.maxAttemptsPerDay ?? 2),
  });
  const set =
    (key: keyof typeof form) =>
    (e: { target: { value: string } }): void =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const numbers = identity.data?.numbers.filter((n) => n.status === 'ACTIVE') ?? [];

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const body = {
      name: form.name,
      callCategory: form.callCategory,
      type: form.type,
      callerNumberId: form.callerNumberId || null,
      selection: { kind: 'FILTER', ...(form.statuses.length ? { statuses: form.statuses } : {}) },
      windowStart: form.windowStart,
      windowEnd: form.windowEnd,
      startsAt: fromLocalInput(form.startsAt),
      endsAt: fromLocalInput(form.endsAt),
      budgetMinutes: Number(form.budgetMinutes),
      maxConcurrentCalls: Number(form.maxConcurrentCalls),
      maxCallsPerHour: Number(form.maxCallsPerHour),
      maxAttempts: Number(form.maxAttempts),
      retryIntervalMinutes: Math.round(Number(form.retryIntervalHours) * 60),
      maxAttemptsPerDay: Number(form.maxAttemptsPerDay),
    };
    let id = campaign?.id ?? null;
    const ok = await submit.run(async () => {
      if (campaign) {
        await api.put(`/campaigns/${campaign.id}`, body);
      } else {
        id = (await api.post<{ id: string }>('/campaigns', body)).id;
      }
    });
    if (ok && id) router.push(`/app/campaigns/${id}`);
  };

  if (identity.error && !identity.data)
    return <ErrorBlock message={identity.error} onRetry={identity.reload} />;
  if (!identity.data) return <LoadingBlock label="Loading caller numbers" />;

  return (
    <div className="grid gap-8">
      <div>
        <Link
          href={campaign ? `/app/campaigns/${campaign.id}` : '/app/campaigns'}
          className="text-sm font-semibold text-accent hover:underline"
        >
          ← {campaign ? campaign.name : 'All campaigns'}
        </Link>
        <div className="mt-3">
          <PageHeader
            title={campaign ? 'Edit campaign' : 'New campaign'}
            description="Settings can only tighten the calling rules, never relax them. Saving keeps it a draft."
          />
        </div>
      </div>
      <form onSubmit={(e) => void onSubmit(e)} className="grid gap-6">
        <FormAlert message={submit.error} />
        <Panel title="Basics">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="campaign-name"
              label="Name"
              required
              maxLength={120}
              value={form.name}
              onChange={set('name')}
              className="sm:col-span-2"
            />
            <SelectField
              id="campaign-category"
              label="Call type"
              value={form.callCategory}
              onChange={(v) => setForm((f) => ({ ...f, callCategory: v as CallCategory }))}
              options={(Object.keys(CALL_CATEGORY_LABELS) as CallCategory[]).map((c) => ({
                value: c,
                label: CALL_CATEGORY_LABELS[c],
              }))}
              hint="Any sales or qualification content makes a call promotional."
            />
            <SelectField
              id="campaign-type"
              label="Leads"
              value={form.type}
              onChange={(v) => setForm((f) => ({ ...f, type: v as 'STATIC' | 'CONTINUOUS' }))}
              options={[
                { value: 'STATIC', label: 'Fixed list (chosen at the pre-launch check)' },
                { value: 'CONTINUOUS', label: 'Continuous (new matching leads join)' },
              ]}
            />
            <SelectField
              id="campaign-number"
              label="Caller number"
              value={form.callerNumberId}
              onChange={(v) => setForm((f) => ({ ...f, callerNumberId: v }))}
              options={[
                {
                  value: '',
                  label: numbers.length ? 'Choose a number' : 'No active caller numbers',
                },
                ...numbers.map((n) => ({
                  value: n.id,
                  label: `${formatPhone(n.phone)} · ${n.series}xx · ${n.purpose.toLowerCase()}`,
                })),
              ]}
              className="sm:col-span-2"
            />
          </div>
          {numbers.length === 0 ? (
            <div className="mt-4">
              <Notice tone="warn">
                Add a 140xx or 1601xx number on the{' '}
                <Link href="/app/telecom" className="font-semibold underline underline-offset-4">
                  telecom identity
                </Link>{' '}
                page first.
              </Notice>
            </div>
          ) : null}
        </Panel>

        <Panel
          title="Who to call"
          description="Leave every status unticked to include all leads; the check shows who is blocked and why."
        >
          <fieldset>
            <legend className="sr-only">Lead statuses</legend>
            <div className="flex flex-wrap gap-2">
              {LEAD_STATUSES.map((status) => {
                const checked = form.statuses.includes(status);
                return (
                  <label
                    key={status}
                    className={cx(
                      'cursor-pointer rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors',
                      checked
                        ? 'border-accent-tint bg-accent-soft text-accent'
                        : 'border-line text-ink-2',
                    )}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={checked}
                      onChange={() =>
                        setForm((f) => ({
                          ...f,
                          statuses: checked
                            ? f.statuses.filter((s) => s !== status)
                            : [...f.statuses, status],
                        }))
                      }
                    />
                    {LEAD_STATUS_LABELS[status]}
                  </label>
                );
              })}
            </div>
          </fieldset>
        </Panel>

        <Panel
          title="When"
          description="Daily window in the recipient’s local time. Promotional calls are allowed only 10:00–21:00."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="window-start"
              label="Daily start"
              type="time"
              required
              value={form.windowStart}
              onChange={set('windowStart')}
            />
            <Field
              id="window-end"
              label="Daily end"
              type="time"
              required
              value={form.windowEnd}
              onChange={set('windowEnd')}
            />
            <Field
              id="starts-at"
              label="Start date (optional)"
              type="datetime-local"
              value={form.startsAt}
              onChange={set('startsAt')}
            />
            <Field
              id="ends-at"
              label="End date (optional)"
              type="datetime-local"
              value={form.endsAt}
              onChange={set('endsAt')}
            />
          </div>
        </Panel>

        <Panel title="Pacing, retries and budget">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              id="budget"
              label="Minute budget"
              type="number"
              min={1}
              required
              value={form.budgetMinutes}
              onChange={set('budgetMinutes')}
            />
            <Field
              id="concurrent"
              label="Calls at once"
              type="number"
              min={1}
              max={20}
              required
              value={form.maxConcurrentCalls}
              onChange={set('maxConcurrentCalls')}
            />
            <Field
              id="per-hour"
              label="Calls per hour"
              type="number"
              min={1}
              max={1000}
              required
              value={form.maxCallsPerHour}
              onChange={set('maxCallsPerHour')}
            />
            <Field
              id="attempts"
              label="Attempts per lead"
              type="number"
              min={1}
              max={3}
              required
              value={form.maxAttempts}
              onChange={set('maxAttempts')}
              hint="At most 3."
            />
            <Field
              id="interval"
              label="Hours between attempts"
              type="number"
              min={4}
              step={0.5}
              required
              value={form.retryIntervalHours}
              onChange={set('retryIntervalHours')}
              hint="At least 4."
            />
            <Field
              id="per-day"
              label="Attempts per lead per day"
              type="number"
              min={1}
              max={2}
              required
              value={form.maxAttemptsPerDay}
              onChange={set('maxAttemptsPerDay')}
              hint="At most 2."
            />
          </div>
        </Panel>

        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary" disabled={submit.pending}>
            {submit.pending ? 'Saving…' : campaign ? 'Save changes' : 'Create campaign'}
          </button>
          <Link
            href={campaign ? `/app/campaigns/${campaign.id}` : '/app/campaigns'}
            className="btn btn-secondary"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

/** Loads a draft and shows it in the form; launched campaigns cannot be edited. */
export function CampaignEdit({ id }: { readonly id: string }) {
  const campaign = useResource<Campaign>(`/campaigns/${id}`);
  if (campaign.error && !campaign.data)
    return <ErrorBlock message={campaign.error} onRetry={campaign.reload} />;
  if (!campaign.data) return <LoadingBlock label="Loading campaign" />;
  if (campaign.data.status !== 'DRAFT') {
    return <Notice tone="warn">Only a draft campaign can be edited.</Notice>;
  }
  return <CampaignForm campaign={campaign.data} />;
}
