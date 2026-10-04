/** Public-site configuration: one place for contact channels and the canonical URL. */
export const siteConfig = {
  name: 'Nivomi AI',
  legalName: 'NIVOMI AI LLP',
  url: 'https://www.nivomi.ai',
  title: 'Nivomi AI — AI Voice Automation for Sales Teams',
  description:
    'AI voice automation for sales teams in India: outbound and inbound AI calls, lead qualification, appointment scheduling, human handoff, transcripts, AI summaries and CRM sync.',
  contact: {
    email: 'nivomiai@gmail.com',
    phoneDisplay: '+91 99462 02458',
    phoneHref: 'tel:+919946202458',
    /** WhatsApp number in wa.me format (country code, digits only). Nivomi's own sales contact. */
    whatsapp: '919946202458',
    addressLines: [
      '63/3658, 1st Floor, CD Tower, Puthiyara (PO)',
      'Kozhikode, Kerala, India 673004',
    ],
  },
} as const;
