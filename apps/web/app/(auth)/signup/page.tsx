import type { Metadata } from 'next';
import { SignupForm } from '@/components/auth/SignupForm';

export const metadata: Metadata = {
  title: 'Create your account',
  description: 'Create a Nivomi AI account.',
  alternates: { canonical: '/signup' },
};

export default async function SignupPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ next?: string; email?: string }>;
}) {
  const params = await searchParams;
  return <SignupForm next={params.next ?? null} defaultEmail={params.email ?? ''} />;
}
