import type { Metadata } from 'next';
import { Team } from '@/components/app/screens/Team';

export const metadata: Metadata = { title: 'Team' };

export default function Page() {
  return <Team />;
}
