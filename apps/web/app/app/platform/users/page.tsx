import type { Metadata } from 'next';
import { PlatformUsers } from '@/components/app/screens/PlatformUsers';

export const metadata: Metadata = { title: 'Platform users' };

export default function Page() {
  return <PlatformUsers />;
}
