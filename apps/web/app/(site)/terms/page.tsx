import type { Metadata } from 'next';
import { LegalPage } from '@/components/marketing/legal/LegalPage';
import { LEGAL_DRAFT_DATE, termsSections } from '@/lib/site/legal';

export const metadata: Metadata = {
  title: 'Terms of service',
  description: 'Terms for using Nivomi AI. Draft pending legal review.',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of service"
      summary="The terms that will govern use of the Nivomi AI platform and this website."
      updated={LEGAL_DRAFT_DATE}
      sections={termsSections}
    />
  );
}
