import type { Metadata } from 'next';
import { Suppression } from '@/components/app/screens/Suppression';

export const metadata: Metadata = { title: 'Suppression list' };

export default function Page() {
  return <Suppression />;
}
