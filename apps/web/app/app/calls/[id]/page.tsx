import type { Metadata } from 'next';
import { CallDetail } from '@/components/app/screens/CallDetail';

export const metadata: Metadata = { title: 'Call' };

export default async function Page({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CallDetail id={id} />;
}
