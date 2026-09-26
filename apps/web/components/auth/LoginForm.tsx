'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { AuthCard, Field, FormAlert, Notice, SubmitButton, TextLink } from '@/components/app/ui';
import { api, safeNext } from '@/lib/app/api';
import { useSubmit } from '@/lib/app/use-submit';

export function LoginForm({
  next,
  notice,
}: {
  readonly next: string | null;
  readonly notice: string | null;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const submit = useSubmit();
  const router = useRouter();

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const ok = await submit.run(() => api.post('/auth/login', { email, password }));
    if (ok) router.replace(safeNext(next));
  };

  const signupHref = next ? `/signup?next=${encodeURIComponent(next)}` : '/signup';

  return (
    <AuthCard
      title="Sign in"
      intro="Welcome back. Sign in to manage your AI calling."
      footer={
        <>
          New to Nivomi? <TextLink href={signupHref}>Create an account</TextLink>
        </>
      }
    >
      <form noValidate onSubmit={(e) => void onSubmit(e)} className="grid gap-5">
        {notice ? <Notice tone="success">{notice}</Notice> : null}
        <FormAlert message={submit.error} />
        <Field
          id="email"
          label="Work email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div>
          <Field
            id="password"
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className="mt-2 text-right text-sm">
            <TextLink href="/forgot-password">Forgot password?</TextLink>
          </div>
        </div>
        <SubmitButton pending={submit.pending} pendingLabel="Signing in…">
          Sign in
        </SubmitButton>
      </form>
    </AuthCard>
  );
}
