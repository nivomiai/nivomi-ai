'use client';

import { useState } from 'react';
import {
  USAGE_EVENT_KINDS,
  USAGE_KIND_LABELS,
  type Plan,
  type PlanStatus,
  type UsageEventKind,
} from '@/lib/api/types';
import { api } from '@/lib/app/api';
import { useSession } from '@/lib/app/session';
import { useResource } from '@/lib/app/use-resource';
import { useSubmit } from '@/lib/app/use-submit';
import { cx } from '@/lib/site/cx';
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
  selectClass,
} from '../ui';

type DraftState = { kind: 'create' } | { kind: 'edit'; plan: Plan } | null;

interface DraftForm {
  code: string;
  name: string;
  monthlyRupees: string;
  annualDiscountPct: string;
  status: PlanStatus;
  displayOrder: string;
  limits: Partial<Record<UsageEventKind, string>>;
  overageRates: Partial<Record<UsageEventKind, string>>;
}

function emptyForm(): DraftForm {
  return {
    code: '',
    name: '',
    monthlyRupees: '',
    annualDiscountPct: '20',
    status: 'ACTIVE',
    displayOrder: '0',
    limits: {},
    overageRates: {},
  };
}

function fromPlan(plan: Plan): DraftForm {
  const stringMap = (
    source: Partial<Record<UsageEventKind, number>>,
  ): Partial<Record<UsageEventKind, string>> => {
    const out: Partial<Record<UsageEventKind, string>> = {};
    for (const kind of USAGE_EVENT_KINDS) {
      const value = source[kind];
      if (typeof value === 'number') out[kind] = String(value);
    }
    return out;
  };
  return {
    code: plan.code,
    name: plan.name,
    monthlyRupees: (plan.monthlyPaiseInr / 100).toFixed(2),
    annualDiscountPct: (plan.annualDiscountBps / 100).toString(),
    status: plan.status,
    displayOrder: String(plan.displayOrder),
    limits: stringMap(plan.limits),
    overageRates: stringMap(plan.overageRates),
  };
}

function effectiveAnnualPaise(monthlyPaiseInr: number, annualDiscountBps: number): number {
  if (monthlyPaiseInr <= 0) return 0;
  const full = monthlyPaiseInr * 12;
  const discount = Math.round((full * annualDiscountBps) / 10000);
  return Math.max(0, full - discount);
}

function formatRupees(paise: number): string {
  const r = paise / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(r);
}

const STATUS_TONE: Record<PlanStatus, 'live' | 'neutral'> = {
  ACTIVE: 'live',
  ARCHIVED: 'neutral',
};

export function PlatformPlans() {
  const { me } = useSession();
  const page = useResource<{ items: Plan[] }>('/platform/plans');
  const [draft, setDraft] = useState<DraftState>(null);

  if (!me?.user.isSuperAdmin) {
    return (
      <div className="grid gap-8">
        <PageHeader title="Plans" />
        <EmptyState icon="i-shield" title="Super Admin only">
          <p>Only a platform Super Admin may open this section.</p>
        </EmptyState>
      </div>
    );
  }

  const plans = page.data?.items ?? [];

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Plans"
        description="The subscription catalogue customers see on the pricing page and the super admin picks from when assigning an organization."
        actions={
          <button
            type="button"
            onClick={() => setDraft({ kind: 'create' })}
            className="btn btn-primary"
          >
            Create plan
          </button>
        }
      />

      {page.error ? (
        <ErrorBlock message={page.error} onRetry={page.reload} />
      ) : page.loading && !page.data ? (
        <LoadingBlock label="Loading plans" />
      ) : plans.length === 0 ? (
        <EmptyState icon="i-layers" title="No plans yet">
          <p>Create the first one — it appears on the marketing pricing page as soon as it is ACTIVE.</p>
        </EmptyState>
      ) : (
        <div className="grid gap-3">
          {plans.map((plan) => (
            <PlanRow
              key={plan.id}
              plan={plan}
              onEdit={() => setDraft({ kind: 'edit', plan })}
              onChanged={page.reload}
            />
          ))}
        </div>
      )}

      {draft ? (
        <PlanDialog
          draft={draft}
          onClose={() => setDraft(null)}
          onSaved={() => {
            setDraft(null);
            page.reload();
          }}
        />
      ) : null}
    </div>
  );
}

function PlanRow({
  plan,
  onEdit,
  onChanged,
}: {
  readonly plan: Plan;
  readonly onEdit: () => void;
  readonly onChanged: () => void;
}) {
  const submit = useSubmit();
  const archive = async () => {
    if (plan.orgsActive > 0) return;
    if (!confirm(`Archive "${plan.name}"? It will stop appearing on the pricing page.`)) return;
    const ok = await submit.run(async () => {
      await api.post(`/platform/plans/${plan.id}/archive`, {});
    });
    if (ok) onChanged();
  };

  return (
    <article className="rounded-[16px] border border-line bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[17px] font-bold text-ink">{plan.name}</h3>
            <Badge tone={STATUS_TONE[plan.status]}>{plan.status}</Badge>
            {plan.orgsActive > 0 ? (
              <Badge tone="accent">
                {plan.orgsActive} org{plan.orgsActive === 1 ? '' : 's'}
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-[13px] text-muted">
            <code className="rounded bg-soft px-1.5 py-0.5">{plan.code}</code> ·{' '}
            {plan.monthlyPaiseInr > 0
              ? `${formatRupees(plan.monthlyPaiseInr)} / month`
              : 'Custom pricing'}
            {plan.monthlyPaiseInr > 0
              ? ` · ${formatRupees(effectiveAnnualPaise(plan.monthlyPaiseInr, plan.annualDiscountBps))} / year (${(plan.annualDiscountBps / 100).toFixed(0)}% off)`
              : ''}{' '}
            · display order {plan.displayOrder}
          </p>
          {Object.keys(plan.limits).length > 0 ? (
            <p className="mt-2 text-[13px] text-ink-2">
              {Object.entries(plan.limits)
                .filter(([, v]) => typeof v === 'number')
                .map(
                  ([k, v]) =>
                    `${USAGE_KIND_LABELS[k as UsageEventKind]}: ${v?.toLocaleString() ?? '-'}`,
                )
                .join(' · ')}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <FormAlert message={submit.error} />
          <button type="button" onClick={onEdit} className="btn btn-secondary btn-sm">
            Edit
          </button>
          {plan.status === 'ACTIVE' ? (
            <button
              type="button"
              onClick={() => void archive()}
              disabled={plan.orgsActive > 0 || submit.pending}
              title={
                plan.orgsActive > 0
                  ? 'Move the orgs on this plan to another plan first.'
                  : undefined
              }
              className={cx('btn btn-secondary btn-sm', plan.orgsActive === 0 && 'text-warn')}
            >
              Archive
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function PlanDialog({
  draft,
  onClose,
  onSaved,
}: {
  readonly draft: Exclude<DraftState, null>;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}) {
  const [form, setForm] = useState<DraftForm>(
    draft.kind === 'create' ? emptyForm() : fromPlan(draft.plan),
  );
  const submit = useSubmit();
  const isEdit = draft.kind === 'edit';

  const title = isEdit ? `Edit ${draft.plan.name}` : 'Create plan';

  const parseLimit = (value: string | undefined): number | undefined => {
    if (value === undefined || value.trim() === '') return undefined;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
  };

  const save = async () => {
    const ok = await submit.run(async () => {
      const rupees = Number(form.monthlyRupees || '0');
      if (!Number.isFinite(rupees) || rupees < 0) {
        throw new Error('Monthly price must be a non-negative number of rupees.');
      }
      const discountPct = Number(form.annualDiscountPct || '0');
      if (!Number.isFinite(discountPct) || discountPct < 0 || discountPct > 100) {
        throw new Error('Annual discount must be between 0 and 100%.');
      }
      await persist(rupees, Math.round(discountPct * 100));
    });
    if (ok) onSaved();
  };

  const persist = async (rupees: number, annualDiscountBps: number) => {
    const payload: Record<string, unknown> = {
      code: form.code.trim(),
      name: form.name.trim(),
      monthlyPaiseInr: Math.round(rupees * 100),
      annualDiscountBps,
      limits: Object.fromEntries(
        USAGE_EVENT_KINDS.map((k) => [k, parseLimit(form.limits[k])]).filter(
          ([, v]) => typeof v === 'number',
        ),
      ),
      overageRates: Object.fromEntries(
        USAGE_EVENT_KINDS.map((k) => [k, parseLimit(form.overageRates[k])]).filter(
          ([, v]) => typeof v === 'number',
        ),
      ),
      status: form.status,
      displayOrder: Number(form.displayOrder || '0'),
    };
    if (isEdit) {
      payload.expectedVersion = draft.plan.updatedAt;
      await api.put(`/platform/plans/${draft.plan.id}`, payload);
    } else {
      await api.post('/platform/plans', payload);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl rounded-[18px] border border-line bg-card p-6 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[20px] font-bold text-ink">{title}</h2>
            {isEdit ? (
              <p className="mt-1 text-[12.5px] text-muted">
                Updated {new Date(draft.plan.updatedAt).toLocaleString()}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 text-muted hover:text-ink"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-5">
              <path
                d="m6 6 12 12M18 6 6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          className="mt-5 grid gap-5"
        >
          <FormAlert message={submit.error} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="plan-code"
              label="Code"
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              placeholder="starter"
              hint="Lower-case letters, digits or dashes. Used in URLs and the marketing-site data-plan attribute."
              disabled={isEdit}
              required
            />
            <Field
              id="plan-name"
              label="Display name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Starter"
              required
            />
            <Field
              id="plan-price"
              label="Monthly price (INR)"
              value={form.monthlyRupees}
              onChange={(e) => setForm((f) => ({ ...f, monthlyRupees: e.target.value }))}
              placeholder="999"
              hint="Rupees. Enter 0 for Custom-pricing plans like Enterprise."
              inputMode="numeric"
              required
            />
            <Field
              id="plan-annual-discount"
              label="Annual discount (%)"
              value={form.annualDiscountPct}
              onChange={(e) => setForm((f) => ({ ...f, annualDiscountPct: e.target.value }))}
              placeholder="20"
              hint="Marketing site shows annual = monthly × 12 × (1 − this %). 0 keeps the full annual price."
              inputMode="numeric"
            />
            <Field
              id="plan-order"
              label="Display order"
              value={form.displayOrder}
              onChange={(e) => setForm((f) => ({ ...f, displayOrder: e.target.value }))}
              placeholder="10"
              hint="Lower comes first on the pricing page. Starter < Growth < Business < Enterprise."
              inputMode="numeric"
              required
            />
            <div className="sm:col-span-2">
              <label htmlFor="plan-status" className="text-sm font-semibold text-ink">
                Status
              </label>
              <select
                id="plan-status"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as PlanStatus }))}
                className={selectClass}
              >
                <option value="ACTIVE">Active — shown on the pricing page</option>
                <option value="ARCHIVED">Archived — hidden from the public endpoint</option>
              </select>
            </div>
          </div>

          <Panel title="Monthly limits" description="Leave blank for unmetered.">
            <div className="grid gap-3 sm:grid-cols-2">
              {USAGE_EVENT_KINDS.map((kind) => (
                <Field
                  key={`limit-${kind}`}
                  id={`limit-${kind}`}
                  label={USAGE_KIND_LABELS[kind]}
                  value={form.limits[kind] ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      limits: { ...f.limits, [kind]: e.target.value },
                    }))
                  }
                  inputMode="numeric"
                  placeholder="unlimited"
                />
              ))}
            </div>
          </Panel>

          <Panel
            title="Overage rates (paise per unit)"
            description="What a tenant is charged per extra unit beyond the monthly limit."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {USAGE_EVENT_KINDS.map((kind) => (
                <Field
                  key={`over-${kind}`}
                  id={`over-${kind}`}
                  label={USAGE_KIND_LABELS[kind]}
                  value={form.overageRates[kind] ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      overageRates: { ...f.overageRates, [kind]: e.target.value },
                    }))
                  }
                  inputMode="numeric"
                  placeholder="0"
                />
              ))}
            </div>
          </Panel>

          <Notice tone="info">
            Changes land on the pricing page within 60 seconds (public endpoint cache). Updating an
            ACTIVE plan does not re-bill existing organizations until their next cycle.
          </Notice>

          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={submit.pending} className="btn btn-primary">
              {submit.pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create plan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
