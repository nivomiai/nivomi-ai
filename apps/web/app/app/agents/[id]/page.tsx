import type { Metadata } from 'next';
import { AgentEditor } from '@/components/app/screens/AgentEditor';

export const metadata: Metadata = { title: 'AI agent' };

export default async function Page({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AgentEditor id={id} />;
}
