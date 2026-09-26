'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { AuthCard, ErrorBlock, LoadingBlock } from '@/components/app/ui';
import { errorMessage } from '@/lib/api/client';
import { api } from '@/lib/app/api';

type State = { kind: 'verifying' } | { kind: 'done' } | { kind: 'failed'; message: string };

/** Redeems the emailed verification link once on arrival. */
export function VerifyEmail({ token }: { readonly token: string | null }) {
  const [state, setState] = useState<State>(
    token
      ? { kind: 'verifying' }
      : { kind: 'failed', message: 'This verification link is incomplete.' },
  );
  const started = useRef(false);

  useEffect(() => {
    // Strict Mode mounts twice; a token can only be redeemed once.
    if (!token || started.current) return;
    started.current = true;
    api
      .post('/auth/verify-email', { token })
      .then(() => setState({ kind: 'done' }))
      .catch((e: unknown) => setState({ kind: 'failed', message: errorMessage(e) }));
  }, [token]);

  if (state.kind === 'verifying') {
    return (
      <AuthCard title="Verifying your email">
        <LoadingBlock label="Verifying your email" />
      </AuthCard>
    );
  }
  if (state.kind === 'done') {
    return (
      <AuthCard title="Email verified" intro="Thanks — your email address is confirmed.">
        <Link href="/app" className="btn btn-primary w-full">
          Continue to Nivomi
        </Link>
      </AuthCard>
    );
  }
  return (
    <AuthCard
      title="We couldn’t verify your email"
      intro="Links expire after 24 hours and only the newest link works. Sign in to request a new one."
    >
      <div className="grid gap-4">
        <ErrorBlock message={state.message} />
        <Link href="/login?next=%2Fapp" className="btn btn-primary w-full">
          Sign in
        </Link>
      </div>
    </AuthCard>
  );
}
