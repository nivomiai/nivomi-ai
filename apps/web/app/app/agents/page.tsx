import type { Metadata } from 'next';
import { Agents } from '@/components/app/screens/Agents';

export const metadata: Metadata = { title: 'AI Agents' };

export default function Page() {
  return <Agents />;
}
