'use client';

import { useState, type FormEvent } from 'react';
import { AuthCard, Field, FormAlert, Notice, SubmitButton, TextLink } from '@/components/app/ui';
import { api } from '@/lib/app/api';
import { useSubmit } from '@/lib/app/use-submit';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const submit = useSubmit();

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (await submit.run(() => api.post('/auth/forgot-password', { email }))) setSent(true);
  };

  return (
    <AuthCard
      title="Reset your password"
      intro="Enter the email you sign in with and we will send you a reset link."
      footer={
        <>
          Remembered it? <TextLink href="/login">Back to sign in</TextLink>
        </>
      }
    >
      {sent ? (
        <Notice tone="success">
          If an account exists for that email, a reset link is on its way. It expires in one hour.
        </Notice>
      ) : (
        <form noValidate onSubmit={(e) => void onSubmit(e)} className="grid gap-5">
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
          <SubmitButton pending={submit.pending} pendingLabel="Sending…">
            Send reset link
          </SubmitButton>
        </form>
      )}
    </AuthCard>
  );
}
