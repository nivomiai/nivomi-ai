import type { Metadata } from 'next';
import { ImportWizard } from '@/components/app/screens/ImportWizard';

export const metadata: Metadata = { title: 'Import' };

export default async function Page({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ImportWizard id={id} />;
}
