import type { Metadata } from 'next';
import { CampaignEdit } from '@/components/app/screens/CampaignForm';

export const metadata: Metadata = { title: 'Edit campaign' };

export default async function Page({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CampaignEdit id={id} />;
}
