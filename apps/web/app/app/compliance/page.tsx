import type { Metadata } from 'next';
import { Compliance } from '@/components/app/screens/Compliance';

export const metadata: Metadata = { title: 'Compliance' };

export default function Page() {
  return <Compliance />;
}
