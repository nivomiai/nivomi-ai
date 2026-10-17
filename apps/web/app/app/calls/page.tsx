import type { Metadata } from 'next';
import { CallHistory } from '@/components/app/screens/CallHistory';

export const metadata: Metadata = { title: 'Call history' };

export default function Page() {
  return <CallHistory />;
}
