'use client';

import { useMemo, useState } from 'react';
import type { Page, PlatformUser } from '@/lib/api/types';
import { ROLE_LABELS } from '@/lib/api/types';
import { api } from '@/lib/app/api';
import { formatDateTime } from '@/lib/app/format';
import { useSession } from '@/lib/app/session';
import { useResource } from '@/lib/app/use-resource';
import { useSubmit } from '@/lib/app/use-submit';
import {
  Badge,
  EmptyState,
  ErrorBlock,
  FormAlert,
  LoadingBlock,
  PageHeader,
  Panel,
  SelectField,
} from '../ui';

type Filter = 'all' | 'super';

const FILTER_OPTIONS: readonly { readonly value: Filter; readonly label: string }[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'super', label: 'Super admins only' },
];

export function PlatformUsers() {
  const { me } = useSession();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const path = useMemo(() => {
    const params = new URLSearchParams({ limit: '25' });
    if (filter === 'super') params.set('superAdminsOnly', 'true');
    if (query.trim()) params.set('q', query.trim());
    return `/platform/users?${params.toString()}`;
  }, [filter, query]);
  const page = useResource<Page<PlatformUser>>(path);

  if (!me?.user.isSuperAdmin) {
    return (
      <div className="grid gap-8">
        <PageHeader title="Users" />
        <EmptyState icon="i-shield" title="Super Admin only">
          <p>Only a platform Super Admin may open this section.</p>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Users"
        description="Every person who has signed up to Nivomi. Grant or revoke the Super Admin flag. Every change is written to the platform audit log."
      />

      <Panel>
        <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
          <SelectField
            id="platform-users-filter"
            label="Showing"
            value={filter}
            onChange={(value) => setFilter(value as Filter)}
            options={FILTER_OPTIONS.map((item) => ({ value: item.value, label: item.label }))}
          />
          <div>
            <label htmlFor="platform-users-search" className="block text-sm font-semibold text-ink">
              Search
            </label>
            <input
              id="platform-users-search"
              type="search"
              placeholder="Email or name"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="mt-1 h-11 w-full rounded-[10px] border border-line bg-card px-3 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
            />
          </div>
        </div>
      </Panel>

      {page.error ? (
        <ErrorBlock message={page.error} onRetry={page.reload} />
      ) : page.loading && !page.data ? (
        <LoadingBlock label="Loading users" />
      ) : (page.data?.items.length ?? 0) === 0 ? (
        <EmptyState icon="i-users" title="No users match">
          <p>Change the filters, or wait for someone to sign up.</p>
        </EmptyState>
      ) : (
        <div className="grid gap-3">
          {(page.data?.items ?? []).map((user) => (
            <UserRow key={user.id} user={user} currentUserId={me.user.id} onChanged={page.reload} />
          ))}
        </div>
      )}
    </div>
  );
}

function UserRow({
  user,
  currentUserId,
  onChanged,
}: {
  readonly user: PlatformUser;
  readonly currentUserId: string;
  readonly onChanged: () => void;
}) {
  const submit = useSubmit();
  const isSelf = user.id === currentUserId;
  const verified = user.emailVerifiedAt !== null;

  const call = async (action: 'promote' | 'demote') => {
    const ok = await submit.run(async () => {
      await api.post(`/platform/users/${user.id}/${action}`);
    });
    if (ok) onChanged();
  };

  return (
    <article className="rounded-[16px] border border-line bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[17px] font-bold text-ink">{user.name}</h3>
            {user.isSuperAdmin ? <Badge tone="accent">Super admin</Badge> : null}
            {!verified ? <Badge tone="warn">Email unverified</Badge> : null}
            {isSelf ? <Badge tone="neutral">You</Badge> : null}
          </div>
          <p className="mt-1 text-[13px] text-muted">
            {user.email} · joined {formatDateTime(user.createdAt)}
          </p>
          {user.memberships.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {user.memberships.map((membership) => (
                <li
                  key={membership.organizationId}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-soft px-2.5 py-0.5 text-[12.5px] text-ink-2"
                >
                  <span className="font-medium">{membership.organizationName}</span>
                  <span className="text-muted">· {ROLE_LABELS[membership.role]}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[12.5px] text-muted italic">No organization memberships yet.</p>
          )}
        </div>
        <div className="grid gap-2 sm:flex sm:items-center">
          <FormAlert message={submit.error} />
          {user.isSuperAdmin ? (
            <button
              type="button"
              onClick={() => void call('demote')}
              className="btn btn-secondary btn-sm"
              disabled={submit.pending || isSelf}
              title={isSelf ? 'You cannot remove your own Super Admin flag.' : undefined}
            >
              Remove super admin
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void call('promote')}
              className="btn btn-primary btn-sm"
              disabled={submit.pending}
            >
              Make super admin
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
