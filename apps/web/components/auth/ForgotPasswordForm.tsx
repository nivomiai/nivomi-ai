'use client';

import { useState, type FormEvent } from 'react';
import { Field, FormAlert, Notice, SubmitButton } from '@/components/app/ui';
import { SignInCard } from '@/components/auth/SignInFrame';
import { Icon } from '@/components/marketing/primitives';
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
    <SignInCard
      title="Reset your password"
      intro="Enter the email you sign in with and we will send you a reset link."
      alternate={{ prompt: 'Remembered it?', label: 'Back to sign in', href: '/login' }}
      secureNote
    >
      {sent ? (
        <Notice tone="success">
          If an account exists for that email, a reset link is on its way. It expires in one hour.
        </Notice>
      ) : (
        <form noValidate onSubmit={(e) => void onSubmit(e)} className="grid gap-4 tall:gap-5">
          <FormAlert message={submit.error} />
          <Field
            id="email"
            label="Work email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="you@company.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            leading={<Icon name="i-mail" />}
            className="[&_input]:py-3 [&_label]:text-[15px]"
          />
          <SubmitButton
            pending={submit.pending}
            pendingLabel="Sending…"
            className="mt-1 min-h-[50px] text-[16px]"
          >
            Send reset link
            <Icon name="i-arrow" className="size-[18px]" />
          </SubmitButton>
        </form>
      )}
    </SignInCard>
  );
}
