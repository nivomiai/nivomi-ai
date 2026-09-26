'use client';

import { useState, type FormEvent } from 'react';
import type { Page, SessionInfo } from '@/lib/api/types';
import { api } from '@/lib/app/api';
import { describeDevice, formatDateTime } from '@/lib/app/format';
import { useResource } from '@/lib/app/use-resource';
import { useSubmit } from '@/lib/app/use-submit';
import { ErrorBlock, Field, FormAlert, LoadingBlock, Notice, PageHeader, Panel } from '../ui';

export function Security() {
  return (
    <div className="grid gap-8">
      <PageHeader
        title="Security"
        description="Your password and the devices signed in to your account."
      />
      <ChangePassword />
      <Sessions />
    </div>
  );
}

function ChangePassword() {
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [done, setDone] = useState(false);
  const submit = useSubmit();

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setDone(false);
    const ok = await submit.run(() =>
      api.post('/auth/change-password', { currentPassword, newPassword }),
    );
    if (ok) {
      setDone(true);
      setCurrent('');
      setNew('');
    }
  };

  return (
    <Panel title="Change password" description="Other devices are signed out when you change it.">
      <form noValidate onSubmit={(e) => void onSubmit(e)} className="grid max-w-md gap-5">
        {done ? (
          <Notice tone="success">Password changed. Other sessions were signed out.</Notice>
        ) : null}
        <FormAlert message={submit.error} />
        <Field
          id="current-password"
          label="Current password"
          type="password"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(e) => setCurrent(e.target.value)}
        />
        <Field
          id="new-password"
          label="New password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          maxLength={128}
          hint="At least 10 characters."
          value={newPassword}
          onChange={(e) => setNew(e.target.value)}
        />
        <button
          type="submit"
          disabled={submit.pending}
          className="btn btn-primary sm:justify-self-start"
        >
          {submit.pending ? 'Saving…' : 'Change password'}
        </button>
      </form>
    </Panel>
  );
}

function Sessions() {
  const sessions = useResource<Page<SessionInfo>>('/auth/sessions');
  const submit = useSubmit();

  return (
    <Panel title="Active sessions" description="Sign out any device you don’t recognise.">
      {sessions.error ? <ErrorBlock message={sessions.error} onRetry={sessions.reload} /> : null}
      {!sessions.data && !sessions.error ? <LoadingBlock /> : null}
      {sessions.data ? (
        <div className="grid gap-3">
          <FormAlert message={submit.error} />
          <ul className="divide-y divide-line rounded-[14px] border border-line">
            {sessions.data.items.map((session) => (
              <li key={session.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">
                    {describeDevice(session.userAgent)}
                    {session.current ? (
                      <span className="ml-2 rounded-full bg-live-soft px-2 py-0.5 text-[11px] font-bold text-live">
                        This device
                      </span>
                    ) : null}
                  </p>
                  <p className="text-sm text-muted">
                    Last active {formatDateTime(session.lastSeenAt)}
                    {session.ipAddress ? ` · ${session.ipAddress}` : ''}
                  </p>
                </div>
                {session.current ? null : (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={submit.pending}
                    onClick={() =>
                      void submit
                        .run(() => api.del(`/auth/sessions/${session.id}`))
                        .then((ok) => ok && sessions.reload())
                    }
                  >
                    Sign out
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Panel>
  );
}
