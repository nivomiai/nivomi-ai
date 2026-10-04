import type { Metadata } from 'next';
import { PlatformAudit } from '@/components/app/screens/PlatformAudit';

export const metadata: Metadata = { title: 'Platform audit' };

export default function Page() {
  return <PlatformAudit />;
}
