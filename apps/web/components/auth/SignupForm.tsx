'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Field, FormAlert, SubmitButton, TextLink } from '@/components/app/ui';
import { LockIcon, PasswordToggle } from '@/components/auth/field-icons';
import { SignInCard } from '@/components/auth/SignInFrame';
import { Icon } from '@/components/marketing/primitives';
import { api, safeNext } from '@/lib/app/api';
import { useSubmit } from '@/lib/app/use-submit';

const MIN_PASSWORD = 10;

const FIELD = '[&_input]:py-3 [&_label]:text-[15px]';

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
  const [showPassword, setShowPassword] = useState(false);
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
    <SignInCard
      title="Create your account"
      intro="Set up Nivomi for your team."
      alternate={{ prompt: 'Already have an account?', label: 'Sign in', href: loginHref }}
    >
      <form noValidate onSubmit={(e) => void onSubmit(e)} className="grid gap-4">
        <FormAlert message={submit.error} />
        <Field
          id="name"
          label="Your name"
          autoComplete="name"
          placeholder="Priya Nair"
          required
          maxLength={100}
          value={name}
          error={fieldErrors.name ?? null}
          onChange={(e) => setName(e.target.value)}
          leading={<Icon name="i-user" />}
          className={FIELD}
        />
        <Field
          id="email"
          label="Work email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@company.com"
          required
          value={email}
          error={fieldErrors.email ?? null}
          onChange={(e) => setEmail(e.target.value)}
          leading={<Icon name="i-mail" />}
          className={FIELD}
        />
        <Field
          id="password"
          label="Password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          placeholder="Create a password"
          required
          minLength={MIN_PASSWORD}
          maxLength={128}
          hint={`At least ${MIN_PASSWORD} characters. A short phrase works well.`}
          value={password}
          error={fieldErrors.password ?? null}
          onChange={(e) => setPassword(e.target.value)}
          leading={<LockIcon />}
          trailing={
            <PasswordToggle
              controls="password"
              visible={showPassword}
              onToggle={() => setShowPassword((v) => !v)}
            />
          }
          className={FIELD}
        />
        <SubmitButton
          pending={submit.pending}
          pendingLabel="Creating account…"
          className="mt-1 min-h-[50px] text-[16px]"
        >
          Create account
          <Icon name="i-arrow" className="size-[18px]" />
        </SubmitButton>
        <p className="text-center text-[13px] text-muted">
          By creating an account you agree to the <TextLink href="/terms">Terms</TextLink> and{' '}
          <TextLink href="/privacy">Privacy Policy</TextLink>.
        </p>
      </form>
    </SignInCard>
  );
}
