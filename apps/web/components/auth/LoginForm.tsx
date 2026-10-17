'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Field, FormAlert, Notice, SubmitButton, TextLink } from '@/components/app/ui';
import { LockIcon, PasswordToggle } from '@/components/auth/field-icons';
import { SignInCard } from '@/components/auth/SignInFrame';
import { Icon } from '@/components/marketing/primitives';
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
  const [showPassword, setShowPassword] = useState(false);
  const submit = useSubmit();
  const router = useRouter();

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const ok = await submit.run(() => api.post('/auth/login', { email, password }));
    if (ok) router.replace(safeNext(next));
  };

  const signupHref = next ? `/signup?next=${encodeURIComponent(next)}` : '/signup';

  return (
    <SignInCard
      title="Sign in to Nivomi"
      intro="Welcome back. Sign in to manage your AI calling."
      alternate={{ prompt: 'New to Nivomi?', label: 'Create an account', href: signupHref }}
      secureNote
    >
      <form noValidate onSubmit={(e) => void onSubmit(e)} className="grid gap-4 tall:gap-5">
        {notice ? <Notice tone="success">{notice}</Notice> : null}
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
        <div>
          <Field
            id="password"
            label="Password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Enter your password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            leading={<LockIcon />}
            trailing={
              <PasswordToggle
                controls="password"
                visible={showPassword}
                onToggle={() => setShowPassword((v) => !v)}
              />
            }
            className="[&_input]:py-3 [&_label]:text-[15px]"
          />
          <div className="mt-2 text-right text-sm">
            <TextLink href="/forgot-password">Forgot password?</TextLink>
          </div>
        </div>
        <SubmitButton
          pending={submit.pending}
          pendingLabel="Signing in…"
          className="mt-1 min-h-[50px] text-[16px]"
        >
          Sign in
          <Icon name="i-arrow" className="size-[18px]" />
        </SubmitButton>
      </form>
    </SignInCard>
  );
}
