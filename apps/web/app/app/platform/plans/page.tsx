import type { Metadata } from 'next';
import { PlatformPlans } from '@/components/app/screens/PlatformPlans';

export const metadata: Metadata = { title: 'Platform plans' };

export default function Page() {
  return <PlatformPlans />;
}
