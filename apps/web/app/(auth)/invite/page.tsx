import type { Metadata } from 'next';
import { AcceptInvitation } from '@/components/auth/AcceptInvitation';

export const metadata: Metadata = { title: 'Join your team' };

export default async function InvitePage({
  searchParams,
}: {
  readonly searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return <AcceptInvitation token={token ?? null} />;
}
