import type { Metadata } from 'next';
import { TelecomIdentity } from '@/components/app/screens/TelecomIdentity';

export const metadata: Metadata = { title: 'Telecom identity' };

export default function Page() {
  return <TelecomIdentity />;
}
