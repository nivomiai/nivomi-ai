import type { Metadata } from 'next';
import { CallQueue } from '@/components/app/screens/CallQueue';
import { parseQueueFilter } from '@/lib/app/call-queue';

export const metadata: Metadata = { title: 'Call queue' };

export default async function Page({
  searchParams,
}: {
  readonly searchParams: Promise<{ filter?: string | string[] }>;
}) {
  const { filter } = await searchParams;
  return <CallQueue initialFilter={parseQueueFilter(filter)} />;
}
