import type { LegalSection } from '@/components/marketing/legal/LegalPage';
import { siteConfig } from './config';

/**
 * PLACEHOLDER legal content. Structure only — every section must be replaced by counsel-approved
 * text before production launch. Nothing here is final or legal advice.
 */

const contactLine = (
  <p>
    {siteConfig.legalName}, {siteConfig.contact.addressLines.join(', ')} ·{' '}
    {siteConfig.contact.email}
  </p>
);

const placeholder = (what: string) => (
  <p className="rounded-[10px] border border-dashed border-line bg-soft px-4 py-3 text-sm text-muted">
    [Placeholder — {what}. To be completed with legal review.]
  </p>
);

export const LEGAL_DRAFT_DATE = '26 September 2026';

export const privacySections: readonly LegalSection[] = [
  {
    id: 'information-collected',
    title: 'Information we collect',
    body: (
      <>
        <p>
          On this website we collect only the information you choose to give us, for example when
          you ask for a demo or to be notified about a product.
        </p>
        {placeholder(
          'full list of personal data categories, including data processed for customers in the Nivomi platform',
        )}
      </>
    ),
  },
  {
    id: 'contact-form',
    title: 'Contact and enquiry forms',
    body: (
      <>
        <p>
          The enquiry form asks for your name, work email, company, phone number and, optionally,
          your monthly lead volume and a message. Today the form does not send these details to a
          Nivomi server: it opens WhatsApp or your email app with the details filled in, and they
          reach us only if you choose to send them.
        </p>
        {placeholder('processing of enquiries once they reach Nivomi')}
      </>
    ),
  },
  {
    id: 'cookies',
    title: 'Cookies and analytics',
    body: (
      <>
        <p>
          This website does not set advertising cookies. It stores your light or dark theme choice
          in your browser. No analytics provider is active at the moment.
        </p>
        {placeholder('cookie and analytics disclosures once an analytics provider is chosen')}
      </>
    ),
  },
  {
    id: 'use',
    title: 'How we use information',
    body: (
      <>
        <p>We use enquiry details to respond to you and to arrange demos and early access.</p>
        {placeholder('purposes and legal bases under applicable law, including the DPDP Act 2023')}
      </>
    ),
  },
  {
    id: 'service-providers',
    title: 'Service providers',
    body: (
      <>
        <p>
          Nivomi relies on service providers such as cloud hosting, communications and payment
          providers. Some may process data outside India.
        </p>
        {placeholder(
          'list of processors, their roles and locations, and cross-border transfer safeguards',
        )}
      </>
    ),
  },
  {
    id: 'retention',
    title: 'Retention',
    body: placeholder('retention periods per category of data'),
  },
  {
    id: 'security',
    title: 'Security',
    body: (
      <>
        <p>
          We design Nivomi with tenant separation, role-based access, encryption of stored
          credentials and audit logging.
        </p>
        {placeholder('security measures and breach-notification commitments')}
      </>
    ),
  },
  {
    id: 'rights',
    title: 'Your rights',
    body: (
      <>
        <p>
          You can ask us to access, correct or erase your personal data, or withdraw consent, by
          writing to us.
        </p>
        {placeholder('rights, response times and grievance / Data Protection Board details')}
      </>
    ),
  },
  {
    id: 'contact',
    title: 'Contact',
    body: contactLine,
  },
];

export const termsSections: readonly LegalSection[] = [
  {
    id: 'service',
    title: 'Service description',
    body: (
      <>
        <p>
          Nivomi provides AI voice automation for sales teams. The platform is currently offered in
          early access; features marked “Coming soon” are not part of the service.
        </p>
        {placeholder('definition of the service, plans and service levels')}
      </>
    ),
  },
  {
    id: 'acceptable-use',
    title: 'Acceptable use',
    body: (
      <>
        <p>
          Customers must use Nivomi lawfully, including telecom rules on commercial communication,
          consent and do-not-call preferences.
        </p>
        {placeholder('prohibited uses and enforcement')}
      </>
    ),
  },
  {
    id: 'customer-responsibilities',
    title: 'Customer responsibilities',
    body: placeholder(
      'customer obligations, including consent for the leads they call and telecom registrations',
    ),
  },
  {
    id: 'limitations',
    title: 'Service limitations',
    body: (
      <>
        <p>
          AI conversations can make mistakes. Language support and voice quality depend on providers
          and are validated per language.
        </p>
        {placeholder('limitations and availability')}
      </>
    ),
  },
  {
    id: 'ip',
    title: 'Intellectual property',
    body: placeholder('ownership of the platform and of customer data'),
  },
  {
    id: 'payments',
    title: 'Payments',
    body: placeholder('fees, included usage, overage, invoicing and taxes'),
  },
  {
    id: 'termination',
    title: 'Termination',
    body: placeholder('termination rights and data export on exit'),
  },
  {
    id: 'disclaimers',
    title: 'Disclaimers',
    body: placeholder('warranty disclaimers'),
  },
  {
    id: 'liability',
    title: 'Limitation of liability',
    body: placeholder('liability caps and exclusions'),
  },
  {
    id: 'governing-law',
    title: 'Governing law',
    body: placeholder('governing law and jurisdiction'),
  },
  {
    id: 'contact',
    title: 'Contact',
    body: contactLine,
  },
];
