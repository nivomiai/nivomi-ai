'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import {
  AuthCard,
  ErrorBlock,
  Field,
  FormAlert,
  SubmitButton,
  TextLink,
} from '@/components/app/ui';
import { api } from '@/lib/app/api';
import { useSubmit } from '@/lib/app/use-submit';

export function ResetPasswordForm({ token }: { readonly token: string | null }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [mismatch, setMismatch] = useState<string | null>(null);
  const submit = useSubmit();
  const router = useRouter();

  if (!token) {
    return (
      <AuthCard title="Reset link incomplete">
        <ErrorBlock message="Open the link from your email again, or request a new one." />
        <p className="mt-5 text-center text-sm">
          <TextLink href="/forgot-password">Request a new link</TextLink>
        </p>
      </AuthCard>
    );
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirm) {
      setMismatch('The passwords do not match.');
      return;
    }
    setMismatch(null);
    const ok = await submit.run(() => api.post('/auth/reset-password', { token, password }));
    if (ok) router.replace('/login?reset=1');
  };

  return (
    <AuthCard
      title="Choose a new password"
      intro="For your security, this signs you out on every device."
    >
      <form noValidate onSubmit={(e) => void onSubmit(e)} className="grid gap-5">
        <FormAlert message={submit.error} />
        <Field
          id="password"
          label="New password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          maxLength={128}
          hint="At least 10 characters."
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Field
          id="confirm"
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          error={mismatch}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <SubmitButton pending={submit.pending} pendingLabel="Saving…">
          Save new password
        </SubmitButton>
        {submit.code === 'VALIDATION_ERROR' ? (
          <p className="text-center text-sm">
            <TextLink href="/forgot-password">Request a new link</TextLink>
          </p>
        ) : null}
      </form>
    </AuthCard>
  );
}
