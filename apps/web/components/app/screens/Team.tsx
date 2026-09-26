'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { errorMessage } from '@/lib/api/client';
import {
  ROLES,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  type Invitation,
  type Member,
  type Page,
  type Role,
} from '@/lib/api/types';
import { api } from '@/lib/app/api';
import { formatDateTime } from '@/lib/app/format';
import { useSession } from '@/lib/app/session';
import { useResource } from '@/lib/app/use-resource';
import { useSubmit } from '@/lib/app/use-submit';
import {
  EmptyState,
  ErrorBlock,
  Field,
  FormAlert,
  LoadingBlock,
  Notice,
  PageHeader,
  Panel,
  RoleBadge,
  selectClass,
} from '../ui';

export function Team() {
  const { me, can } = useSession();
  const members = useResource<Page<Member>>('/organizations/current/members');
  const invitations = useResource<Page<Invitation>>(
    can('members.invite') ? '/organizations/current/invitations' : null,
  );
  const isOwner = me?.activeOrganization?.role === 'OWNER';

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Team"
        description="People who can access this organization and what they can do."
      />
      {can('members.invite') ? (
        <InviteForm allowPrivileged={isOwner} onInvited={invitations.reload} />
      ) : null}
      <Panel title="Members">
        {members.loading && !members.data ? <LoadingBlock /> : null}
        {members.error ? <ErrorBlock message={members.error} onRetry={members.reload} /> : null}
        {members.data ? (
          <MemberList
            members={members.data.items}
            currentUserId={me?.user.id ?? ''}
            canEditRoles={can('members.update_role')}
            canRemove={can('members.remove')}
            isOwner={isOwner}
            onChanged={members.reload}
          />
        ) : null}
      </Panel>
      {can('members.invite') ? (
        <Panel title="Pending invitations" description="Invitations expire after 7 days.">
          {invitations.error ? (
            <ErrorBlock message={invitations.error} onRetry={invitations.reload} />
          ) : invitations.data ? (
            <InvitationList items={invitations.data.items} onChanged={invitations.reload} />
          ) : (
            <LoadingBlock />
          )}
        </Panel>
      ) : null}
      <LeaveOrganization />
    </div>
  );
}

function InviteForm({
  allowPrivileged,
  onInvited,
}: {
  readonly allowPrivileged: boolean;
  readonly onInvited: () => void;
}) {
  const roles = ROLES.filter((r) => allowPrivileged || (r !== 'OWNER' && r !== 'ADMIN'));
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('AGENT');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const submit = useSubmit();

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSentTo(null);
    const invited = email.trim();
    const ok = await submit.run(() =>
      api.post('/organizations/current/invitations', { email: invited, role }),
    );
    if (ok) {
      setSentTo(invited);
      setEmail('');
      onInvited();
    }
  };

  return (
    <Panel title="Invite a teammate" description="They will get an email with a link to join.">
      <form noValidate onSubmit={(e) => void onSubmit(e)} className="grid gap-4">
        {sentTo ? <Notice tone="success">Invitation sent to {sentTo}.</Notice> : null}
        <FormAlert message={submit.error} />
        <div className="grid gap-4 sm:grid-cols-[1fr_200px_auto] sm:items-end">
          <Field
            id="invite-email"
            label="Email"
            type="email"
            autoComplete="off"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <div>
            <label htmlFor="invite-role" className="text-sm font-semibold text-ink">
              Role
            </label>
            <select
              id="invite-role"
              className={selectClass}
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              {roles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={submit.pending} className="btn btn-primary">
            {submit.pending ? 'Sending…' : 'Send invite'}
          </button>
        </div>
        <p className="text-[13px] text-muted">{ROLE_DESCRIPTIONS[role]}</p>
      </form>
    </Panel>
  );
}

function MemberList({
  members,
  currentUserId,
  canEditRoles,
  canRemove,
  isOwner,
  onChanged,
}: {
  readonly members: Member[];
  readonly currentUserId: string;
  readonly canEditRoles: boolean;
  readonly canRemove: boolean;
  readonly isOwner: boolean;
  readonly onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (memberId: string, action: () => Promise<void>) => {
    setBusy(memberId);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  /** Mirrors the server rule: only owners manage owners and admins. */
  const manageable = (member: Member) =>
    member.userId !== currentUserId &&
    (isOwner || (member.role !== 'OWNER' && member.role !== 'ADMIN'));
  const assignable = ROLES.filter((r) => isOwner || (r !== 'OWNER' && r !== 'ADMIN'));

  return (
    <div className="grid gap-3">
      <FormAlert message={error} />
      <ul className="divide-y divide-line rounded-[14px] border border-line">
        {members.map((member) => (
          <li key={member.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-ink">
                {member.name}
                {member.userId === currentUserId ? (
                  <span className="text-muted"> (you)</span>
                ) : null}
              </p>
              <p className="truncate text-sm text-muted">{member.email}</p>
            </div>
            {canEditRoles && manageable(member) ? (
              <select
                aria-label={`Role for ${member.name}`}
                className={`${selectClass} mt-0 w-auto py-2`}
                value={member.role}
                disabled={busy === member.id}
                onChange={(e) =>
                  void act(member.id, () =>
                    api.put(`/organizations/current/members/${member.id}/role`, {
                      role: e.target.value,
                    }),
                  )
                }
              >
                {assignable.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            ) : (
              <RoleBadge role={member.role} />
            )}
            {canRemove && manageable(member) ? (
              <button
                type="button"
                disabled={busy === member.id}
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  if (window.confirm(`Remove ${member.name} from this organization?`)) {
                    void act(member.id, () =>
                      api.del(`/organizations/current/members/${member.id}`),
                    );
                  }
                }}
              >
                Remove
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function InvitationList({
  items,
  onChanged,
}: {
  readonly items: Invitation[];
  readonly onChanged: () => void;
}) {
  const submit = useSubmit();
  if (items.length === 0) {
    return <EmptyState icon="i-mail" title="No pending invitations" />;
  }
  return (
    <div className="grid gap-3">
      <FormAlert message={submit.error} />
      <ul className="divide-y divide-line rounded-[14px] border border-line">
        {items.map((invitation) => (
          <li key={invitation.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-ink">{invitation.email}</p>
              <p className="text-sm text-muted">Expires {formatDateTime(invitation.expiresAt)}</p>
            </div>
            <RoleBadge role={invitation.role} />
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={submit.pending}
              onClick={() =>
                void submit
                  .run(() => api.del(`/organizations/current/invitations/${invitation.id}`))
                  .then((ok) => ok && onChanged())
              }
            >
              Revoke
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LeaveOrganization() {
  const { refresh } = useSession();
  const router = useRouter();
  const submit = useSubmit();
  return (
    <Panel
      title="Leave organization"
      description="You will lose access until someone invites you again."
    >
      <div className="grid gap-3 sm:justify-start">
        <FormAlert message={submit.error} />
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={submit.pending}
          onClick={() => {
            if (!window.confirm('Leave this organization?')) return;
            void submit
              .run(async () => {
                await api.post('/organizations/current/leave');
                await refresh();
              })
              .then((ok) => ok && router.replace('/app'));
          }}
        >
          Leave organization
        </button>
      </div>
    </Panel>
  );
}
