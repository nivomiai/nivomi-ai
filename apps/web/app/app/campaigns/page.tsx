import type { Metadata } from 'next';
import { Campaigns } from '@/components/app/screens/Campaigns';

export const metadata: Metadata = { title: 'Campaigns' };

export default function Page() {
  return <Campaigns />;
}
