import type { Metadata } from 'next';
import { NewLead } from '@/components/app/screens/NewLead';

export const metadata: Metadata = { title: 'Add a lead' };

export default function Page() {
  return <NewLead />;
}
