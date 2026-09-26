import type { Metadata } from 'next';
import { LegalPage } from '@/components/marketing/legal/LegalPage';
import { LEGAL_DRAFT_DATE, privacySections } from '@/lib/site/legal';

export const metadata: Metadata = {
  title: 'Privacy notice',
  description: 'How Nivomi AI handles personal information. Draft pending legal review.',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy notice"
      summary="How Nivomi AI collects, uses and protects personal information on this website and in the Nivomi platform."
      updated={LEGAL_DRAFT_DATE}
      sections={privacySections}
    />
  );
}
