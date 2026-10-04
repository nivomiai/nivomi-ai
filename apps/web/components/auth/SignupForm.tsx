'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { AuthCard, Field, FormAlert, SubmitButton, TextLink } from '@/components/app/ui';
import { api, safeNext } from '@/lib/app/api';
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
  const submit = useSubmit();
  const router = useRouter();

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
    const ok = await submit.run(async () => {
      await api.post('/auth/register', { name, email, password });
      await api.post('/auth/login', { email, password });
    });
    if (ok) router.replace(safeNext(next));
  };

  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : '/login';

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
