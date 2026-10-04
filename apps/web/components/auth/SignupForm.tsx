'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { AuthCard, Field, FormAlert, SubmitButton, TextLink } from '@/components/app/ui';
import { api } from '@/lib/app/api';
import { useSubmit } from '@/lib/app/use-submit';

const MIN_PASSWORD = 10;

export function SignupForm({
  next,
  defaultEmail,
}: {
  readonly next: string | null;
  readonly defaultEmail: string;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [sentTo, setSentTo] = useState<string | null>(null);
  const submit = useSubmit();

  const validate = () => {
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = 'Enter your name.';
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) errors.email = 'Enter a valid email address.';
    if (password.length < MIN_PASSWORD)
      errors.password = `Use at least ${MIN_PASSWORD} characters.`;
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!validate()) return;
    const ok = await submit.run(() => api.post('/auth/register', { name, email, password }));
    if (ok) setSentTo(email.trim());
  };

  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : '/login';

  if (sentTo) {
    return (
      <AuthCard
        title="Account ready"
        intro={
          <>
            Your account <strong className="text-ink">{sentTo}</strong> is set up. Sign in to
            continue.
          </>
        }
      >
        <div className="grid gap-3">
          <Link href={loginHref} className="btn btn-primary w-full">
            Continue to sign in
          </Link>
          <p className="text-center text-sm text-muted">
            Already have an account with this email? Just sign in.
          </p>
        </div>
      </AuthCard>
    );
    // Email verification disabled for now — original "Check your email" copy preserved below.
    // return (
    //   <AuthCard
    //     title="Check your email"
    //     intro={
    //       <>
    //         If <strong className="text-ink">{sentTo}</strong> can be registered, we have sent a
    //         verification link to it. The link expires in 24 hours.
    //       </>
    //     }
    //   >…</AuthCard>
    // );
  }

  return (
    <AuthCard
      title="Create your account"
      intro="Set up Nivomi for your team."
      footer={
        <>
          Already have an account? <TextLink href={loginHref}>Sign in</TextLink>
        </>
      }
    >
      <form noValidate onSubmit={(e) => void onSubmit(e)} className="grid gap-5">
        <FormAlert message={submit.error} />
        <Field
          id="name"
          label="Your name"
          autoComplete="name"
          required
          maxLength={100}
          value={name}
          error={fieldErrors.name ?? null}
          onChange={(e) => setName(e.target.value)}
        />
        <Field
          id="email"
          label="Work email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          error={fieldErrors.email ?? null}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD}
          maxLength={128}
          hint={`At least ${MIN_PASSWORD} characters. A short phrase works well.`}
          value={password}
          error={fieldErrors.password ?? null}
          onChange={(e) => setPassword(e.target.value)}
        />
        <SubmitButton pending={submit.pending} pendingLabel="Creating account…">
          Create account
        </SubmitButton>
        <p className="text-center text-[13px] text-muted">
          By creating an account you agree to the <TextLink href="/terms">Terms</TextLink> and{' '}
          <TextLink href="/privacy">Privacy Policy</TextLink>.
        </p>
      </form>
    </AuthCard>
  );
}
