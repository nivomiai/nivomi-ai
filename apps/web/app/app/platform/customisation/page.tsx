import type { Metadata } from 'next';
import { PlatformCustomisation } from '@/components/app/screens/PlatformCustomisation';

export const metadata: Metadata = { title: 'Platform customisation' };

export default function Page() {
  return <PlatformCustomisation />;
}
