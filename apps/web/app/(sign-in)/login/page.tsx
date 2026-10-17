import type { Metadata } from 'next';
import { LoginForm } from '@/components/auth/LoginForm';
import { SignInFrame } from '@/components/auth/SignInFrame';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to Nivomi AI.',
  alternates: { canonical: '/login' },
};

export default async function LoginPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ next?: string; reset?: string; verified?: string }>;
}) {
  const params = await searchParams;
  return (
    <SignInFrame lead="Welcome back to">
      <LoginForm
        next={params.next ?? null}
        notice={
          params.reset === '1'
            ? 'Your password was changed. Sign in with your new password.'
            : params.verified === '1'
              ? 'Your email is verified. Sign in to continue.'
              : null
        }
      />
    </SignInFrame>
  );
}
