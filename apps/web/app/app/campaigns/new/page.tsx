import type { Metadata } from 'next';
import { CampaignForm } from '@/components/app/screens/CampaignForm';

export const metadata: Metadata = { title: 'New campaign' };

export default function Page() {
  return <CampaignForm />;
}
