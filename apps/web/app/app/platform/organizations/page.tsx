import type { Metadata } from 'next';
import { PlatformOrganizations } from '@/components/app/screens/PlatformOrganizations';

export const metadata: Metadata = { title: 'Platform organizations' };

export default function Page() {
  return <PlatformOrganizations />;
}
