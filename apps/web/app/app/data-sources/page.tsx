import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoadingBlock } from '@/components/app/ui';
import { DataSources } from '@/components/app/screens/DataSources';

export const metadata: Metadata = { title: 'Data sources' };

export default function Page() {
  // DataSources reads the ?crm= OAuth outcome from the URL.
  return (
    <Suspense fallback={<LoadingBlock />}>
      <DataSources />
    </Suspense>
  );
}
