import type { Metadata } from 'next';
import { ReviewQueue } from '@/components/app/screens/ReviewQueue';

export const metadata: Metadata = { title: 'Possible duplicates' };

export default function Page() {
  return <ReviewQueue />;
}
