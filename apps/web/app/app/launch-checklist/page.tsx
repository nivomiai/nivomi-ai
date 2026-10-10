import type { Metadata } from 'next';
import { LaunchChecklist } from '@/components/app/screens/LaunchChecklist';

export const metadata: Metadata = { title: 'Launch checklist' };

export default function Page() {
  return <LaunchChecklist />;
}
