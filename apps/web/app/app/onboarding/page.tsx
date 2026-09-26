import type { Metadata } from 'next';
import { Onboarding } from '@/components/app/screens/Onboarding';

export const metadata: Metadata = { title: 'Set up your organization' };

export default function Page() {
  return <Onboarding />;
}
