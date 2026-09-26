import type { Metadata } from 'next';
import { Leads } from '@/components/app/screens/Leads';

export const metadata: Metadata = { title: 'Leads' };

export default function Page() {
  return <Leads />;
}
