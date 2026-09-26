import type { Metadata } from 'next';
import { LeadDetail } from '@/components/app/screens/LeadDetail';

export const metadata: Metadata = { title: 'Lead' };

export default async function Page({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LeadDetail id={id} />;
}
