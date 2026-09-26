import type { Metadata } from 'next';
import { Security } from '@/components/app/screens/Security';

export const metadata: Metadata = { title: 'Security' };

export default function Page() {
  return <Security />;
}
