import type { Metadata } from 'next';
import { CampaignDetail } from '@/components/app/screens/CampaignDetail';

export const metadata: Metadata = { title: 'Campaign' };

export default async function Page({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CampaignDetail id={id} />;
}
