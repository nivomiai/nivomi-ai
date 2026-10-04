import type { Metadata } from 'next';
import { Roles } from '@/components/app/screens/Roles';

export const metadata: Metadata = { title: 'Roles & access' };

export default function Page() {
  return <Roles />;
}
