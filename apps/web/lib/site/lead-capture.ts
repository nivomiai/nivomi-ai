/**
 * Lead capture for the public site.
 *
 * No backend endpoint exists yet, so the only `LeadCaptureClient` hands the enquiry to Nivomi's
 * existing sales channels (WhatsApp, with an email fallback) on the visitor's own device. When
 * the API gains a lead endpoint, add a client that posts to it — the form does not change.
 */

export type LeadIntent = 'demo' | 'early-access' | 'coming-soon';

export interface LeadInput {
  readonly intent: LeadIntent;
  /** Product the visitor is interested in (Coming Soon pages). */
  readonly interest?: string;
  readonly name: string;
  readonly email: string;
  readonly company: string;
  readonly phone: string;
  readonly leadVolume: string;
  readonly message: string;
}

export type LeadField = 'name' | 'email' | 'company' | 'phone' | 'leadVolume' | 'message';
export type LeadErrors = Partial<Record<LeadField, string>>;

export const LEAD_VOLUME_OPTIONS = [
  { value: '', label: 'Select (optional)' },
  { value: 'under-500', label: 'Fewer than 500 leads a month' },
  { value: '500-2000', label: '500 – 2,000 leads a month' },
  { value: '2000-10000', label: '2,000 – 10,000 leads a month' },
  { value: 'over-10000', label: 'More than 10,000 leads a month' },
] as const;

const INTENT_LABEL: Record<LeadIntent, string> = {
  demo: 'Book a demo',
  'early-access': 'Get started (early access)',
  'coming-soon': 'Interested in an upcoming product',
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_CHARS = /^\+?[\d\s()-]+$/;

/** Field order used to focus the first invalid field. */
export const LEAD_FIELD_ORDER: readonly LeadField[] = [
  'name',
  'email',
  'company',
  'phone',
  'leadVolume',
  'message',
];

export function validateLead(input: LeadInput): LeadErrors {
  const errors: LeadErrors = {};
  const name = input.name.trim();
  const email = input.email.trim();
  const company = input.company.trim();
  const phone = input.phone.trim();

  if (name.length < 2) errors.name = 'Please enter your name.';
  else if (name.length > 100) errors.name = 'Please keep your name under 100 characters.';

  if (email === '') errors.email = 'Please enter your work email.';
  else if (email.length > 254 || !EMAIL.test(email))
    errors.email = 'Please enter a valid email address.';

  if (company.length < 2) errors.company = 'Please enter your company name.';
  else if (company.length > 120)
    errors.company = 'Please keep the company name under 120 characters.';

  const digits = phone.replace(/\D/g, '').length;
  if (phone === '') errors.phone = 'Please enter a phone number.';
  else if (!PHONE_CHARS.test(phone) || digits < 8 || digits > 15)
    errors.phone = 'Please enter a valid phone number, e.g. +91 98765 43210.';

  if (
    input.leadVolume !== '' &&
    !LEAD_VOLUME_OPTIONS.some((option) => option.value === input.leadVolume)
  )
    errors.leadVolume = 'Please choose one of the options.';

  if (input.message.length > 1000)
    errors.message = 'Please keep the message under 1,000 characters.';

  return errors;
}

export function firstInvalidField(errors: LeadErrors): LeadField | undefined {
  return LEAD_FIELD_ORDER.find((field) => errors[field] !== undefined);
}

export function buildLeadMessage(input: LeadInput): string {
  const volume = LEAD_VOLUME_OPTIONS.find((o) => o.value === input.leadVolume && o.value !== '');
  return [
    `Hi Nivomi AI — ${INTENT_LABEL[input.intent]}.`,
    input.interest ? `Product: ${input.interest}` : '',
    `Name: ${input.name.trim()}`,
    `Work email: ${input.email.trim()}`,
    `Company: ${input.company.trim()}`,
    `Phone: ${input.phone.trim()}`,
    volume ? `Lead volume: ${volume.label}` : '',
    input.message.trim() ? `Message: ${input.message.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function whatsappUrl(number: string, text: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

export function mailtoUrl(email: string, subject: string, body: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function leadEmailSubject(input: LeadInput): string {
  return input.interest
    ? `${INTENT_LABEL[input.intent]}: ${input.interest} — Nivomi AI`
    : `${INTENT_LABEL[input.intent]} — Nivomi AI`;
}

export interface LeadSubmitResult {
  readonly channel: 'whatsapp';
}

export interface LeadCaptureClient {
  submit(lead: LeadInput): Promise<LeadSubmitResult>;
}

/** Thrown when the enquiry could not be handed off (e.g. the browser blocked the new tab). */
export class LeadHandoffError extends Error {
  constructor(readonly reason: 'blocked' | 'failed') {
    super(`Lead handoff ${reason}`);
    this.name = 'LeadHandoffError';
  }
}

export function createContactChannelClient(deps: {
  readonly whatsappNumber: string;
  /** Opens a URL in a new tab; returns a falsy value when the browser blocked it. */
  readonly openWindow: (url: string) => unknown;
}): LeadCaptureClient {
  return {
    submit(lead) {
      let opened: unknown;
      try {
        opened = deps.openWindow(whatsappUrl(deps.whatsappNumber, buildLeadMessage(lead)));
      } catch {
        return Promise.reject(new LeadHandoffError('failed'));
      }
      if (!opened) return Promise.reject(new LeadHandoffError('blocked'));
      return Promise.resolve({ channel: 'whatsapp' });
    },
  };
}
