'use client';

import { useMemo, useState } from 'react';
import {
  ORGANIZATION_STATUS_LABELS,
  type OrganizationStatus,
  type Page,
  type PlatformOrganization,
} from '@/lib/api/types';
import { api } from '@/lib/app/api';
import { formatDateTime } from '@/lib/app/format';
import { useSession } from '@/lib/app/session';
import { useResource } from '@/lib/app/use-resource';
import { useSubmit } from '@/lib/app/use-submit';
import { cx } from '@/lib/site/cx';
import {
  Badge,
  EmptyState,
  ErrorBlock,
  FormAlert,
  LoadingBlock,
  Notice,
  PageHeader,
  Panel,
  SelectField,
} from '../ui';

interface Filters {
  readonly status: '' | OrganizationStatus;
  readonly q: string;
}

const STATUS_TONE: Record<OrganizationStatus, 'accent' | 'live' | 'warn' | 'neutral'> = {
  PENDING_APPROVAL: 'accent',
  ACTIVE: 'live',
  SUSPENDED: 'warn',
  CLOSED: 'neutral',
};

export function PlatformOrganizations() {
  const { me } = useSession();
  const [filters, setFilters] = useState<Filters>({ status: '', q: '' });
  const path = useMemo(() => {
    const params = new URLSearchParams({ limit: '25' });
    if (filters.status) params.set('status', filters.status);
    if (filters.q.trim()) params.set('q', filters.q.trim());
    return `/platform/organizations?${params.toString()}`;
  }, [filters]);
  const page = useResource<Page<PlatformOrganization>>(path);

  if (!me?.user.isSuperAdmin) {
    return (
      <div className="grid gap-8">
        <PageHeader title="Platform" />
        <EmptyState icon="i-shield" title="Super Admin only">
          <p>Only a platform Super Admin may open this section.</p>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Organizations"
        description="Approve new signups, suspend or reactivate customers. Every action is written to the platform audit log."
      />

      <Panel>
        <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
          <SelectField
            id="platform-status"
            label="Status"
            value={filters.status}
            onChange={(value) => setFilters((f) => ({ ...f, status: value as Filters['status'] }))}
            options={[
              { value: '', label: 'All statuses' },
              ...(Object.keys(ORGANIZATION_STATUS_LABELS) as OrganizationStatus[]).map((s) => ({
                value: s,
                label: ORGANIZATION_STATUS_LABELS[s],
              })),
            ]}
          />
          <div>
            <label htmlFor="platform-search" className="block text-sm font-semibold text-ink">
              Search
            </label>
            <input
              id="platform-search"
              type="search"
              placeholder="Organization name or slug"
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              className="mt-1 h-11 w-full rounded-[10px] border border-line bg-card px-3 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
            />
          </div>
        </div>
      </Panel>

      {page.error ? (
        <ErrorBlock message={page.error} onRetry={page.reload} />
      ) : page.loading && !page.data ? (
        <LoadingBlock label="Loading organizations" />
      ) : (page.data?.items.length ?? 0) === 0 ? (
        <EmptyState icon="i-users" title="No organizations match">
          <p>Change the filters or ask a customer to sign up first.</p>
        </EmptyState>
      ) : (
        <div className="grid gap-3">
          {(page.data?.items ?? []).map((org) => (
            <OrganizationRow key={org.id} organization={org} onChanged={page.reload} />
          ))}
        </div>
      )}
    </div>
  );
}

function OrganizationRow({
  organization,
  onChanged,
}: {
  readonly organization: PlatformOrganization;
  readonly onChanged: () => void;
}) {
  return (
    <article className="rounded-[16px] border border-line bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[17px] font-bold text-ink">{organization.name}</h3>
            <Badge tone={STATUS_TONE[organization.status]}>
              {ORGANIZATION_STATUS_LABELS[organization.status]}
            </Badge>
          </div>
          <p className="mt-1 text-[13px] text-muted">
            {organization.slug} · {organization.memberCount}{' '}
            {organization.memberCount === 1 ? 'member' : 'members'} · created{' '}
            {formatDateTime(organization.createdAt)}
            {organization.createdBy ? ` by ${organization.createdBy.email}` : ''}
          </p>
        </div>
        <OrganizationActions organization={organization} onChanged={onChanged} />
      </div>
    </article>
  );
}

function OrganizationActions({
  organization,
  onChanged,
}: {
  readonly organization: PlatformOrganization;
  readonly onChanged: () => void;
}) {
  const submit = useSubmit();
  const [prompt, setPrompt] = useState<null | { kind: 'suspend' | 'close'; label: string }>(null);
  const [reason, setReason] = useState('');

  const call = async (action: 'approve' | 'reactivate' | 'suspend' | 'close', body?: unknown) => {
    const ok = await submit.run(async () => {
      await api.post(`/platform/organizations/${organization.id}/${action}`, body ?? {});
    });
    if (ok) {
      setPrompt(null);
      setReason('');
      onChanged();
    }
  };

  const canApprove = organization.status === 'PENDING_APPROVAL';
  const canReactivate = organization.status === 'SUSPENDED';
  const canSuspend = organization.status === 'ACTIVE' || organization.status === 'PENDING_APPROVAL';
  const canClose = organization.status !== 'CLOSED';

  return (
    <div className="grid gap-2 sm:flex sm:min-w-0">
      <FormAlert message={submit.error} />
      {canApprove ? (
        <button
          type="button"
          onClick={() => void call('approve')}
          className="btn btn-primary btn-sm"
          disabled={submit.pending}
        >
          Approve
        </button>
      ) : null}
      {canReactivate ? (
        <button
          type="button"
          onClick={() => void call('reactivate')}
          className="btn btn-primary btn-sm"
          disabled={submit.pending}
        >
          Reactivate
        </button>
      ) : null}
      {canSuspend ? (
        <button
          type="button"
          onClick={() => setPrompt({ kind: 'suspend', label: 'Suspend' })}
          className="btn btn-secondary btn-sm"
          disabled={submit.pending}
        >
          Suspend
        </button>
      ) : null}
      {canClose ? (
        <button
          type="button"
          onClick={() => setPrompt({ kind: 'close', label: 'Close' })}
          className={cx('btn btn-secondary btn-sm', canApprove && 'text-warn')}
          disabled={submit.pending}
        >
          Close
        </button>
      ) : null}
      {prompt ? (
        <div className="mt-3 grid gap-2 rounded-[12px] border border-line bg-soft p-3 sm:col-span-2">
          <label
            htmlFor={`reason-${organization.id}`}
            className="text-xs font-bold tracking-[0.08em] text-ink uppercase"
          >
            {prompt.label} reason
          </label>
          <textarea
            id={`reason-${organization.id}`}
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="rounded-[10px] border border-line bg-card px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
            placeholder="Recorded in the audit log — visible to Owners."
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void call(prompt.kind, { reason })}
              className="btn btn-primary btn-sm"
              disabled={submit.pending || reason.trim().length < 3}
            >
              {submit.pending ? 'Working…' : `${prompt.label} organization`}
            </button>
            <button
              type="button"
              onClick={() => {
                setPrompt(null);
                setReason('');
              }}
              className="btn btn-secondary btn-sm"
            >
              Cancel
            </button>
          </div>
          {prompt.kind === 'close' ? (
            <Notice tone="warn">Closing is not reversible in the current build.</Notice>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
