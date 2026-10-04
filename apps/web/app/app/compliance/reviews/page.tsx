import type { Metadata } from 'next';
import { EligibilityReviews } from '@/components/app/screens/EligibilityReviews';

export const metadata: Metadata = { title: 'Review queue' };

export default function Page() {
  return <EligibilityReviews />;
}
