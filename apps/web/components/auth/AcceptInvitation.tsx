'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AuthCard, ErrorBlock, FormAlert, SubmitButton } from '@/components/app/ui';
import type { Me, OrganizationSummary } from '@/lib/api/types';
import { api } from '@/lib/app/api';
import { useResource } from '@/lib/app/use-resource';
import { useSubmit } from '@/lib/app/use-submit';

/** Accepting requires a signed-in account whose email matches the invitation. */
export function AcceptInvitation({ token }: { readonly token: string | null }) {
  const me = useResource<Me>(token ? '/me' : null);
  const submit = useSubmit();
  const [joined, setJoined] = useState<OrganizationSummary | null>(null);

  if (!token) {
    return (
      <AuthCard title="Invitation link incomplete">
        <ErrorBlock message="Open the link from your invitation email again." />
      </AuthCard>
    );
  }

  const here = `/invite?token=${encodeURIComponent(token)}`;

  if (me.loading) {
    return <AuthCard title="Join your team">Checking your account…</AuthCard>;
  }

  if (!me.data) {
    return (
      <AuthCard
        title="Join your team"
        intro="Sign in, or create an account, with the email address the invitation was sent to."
      >
        <div className="grid gap-3">
          <Link href={`/login?next=${encodeURIComponent(here)}`} className="btn btn-primary w-full">
            Sign in to accept
          </Link>
          <Link
            href={`/signup?next=${encodeURIComponent(here)}`}
            className="btn btn-secondary w-full"
          >
            Create an account
          </Link>
        </div>
      </AuthCard>
    );
  }

  if (joined) {
    return (
      <AuthCard title={`You joined ${joined.name}`} intro="Your workspace is ready.">
        <a href="/app" className="btn btn-primary w-full">
          Open {joined.name}
        </a>
      </AuthCard>
    );
  }

  const accept = () =>
    submit.run(async () => {
      setJoined(
        await api.post<OrganizationSummary>('/organizations/invitations/accept', { token }),
      );
    });

  return (
    <AuthCard
      title="Join your team"
      intro={
        <>
          You are signed in as <strong className="text-ink">{me.data.user.email}</strong>.
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void accept();
        }}
        className="grid gap-4"
      >
        <FormAlert message={submit.error} />
        <SubmitButton pending={submit.pending} pendingLabel="Joining…">
          Accept invitation
        </SubmitButton>
      </form>
    </AuthCard>
  );
}
