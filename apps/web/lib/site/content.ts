/**
 * Homepage content. Every capability listed as MVP comes from the approved PRD; everything else
 * lives in `coming-soon.ts`. No customer counts, metrics, testimonials or certifications — the
 * platform has none to show yet.
 */
import type { IconName } from './icons';

export interface NavItem {
  readonly label: string;
  readonly href: string;
}

export const primaryNav: readonly NavItem[] = [
  { label: 'Product', href: '/#product' },
  { label: 'How It Works', href: '/#how-it-works' },
  { label: 'Use Cases', href: '/#use-cases' },
  { label: 'Pricing', href: '/#pricing' },
];

export interface Feature {
  readonly icon: IconName;
  readonly title: string;
  readonly body: string;
}

export const problems: readonly Feature[] = [
  {
    icon: 'i-clock',
    title: 'Leads go cold while they wait',
    body: 'New enquiries arrive faster than reps can call them back, and interest fades by the day.',
  },
  {
    icon: 'i-repeat',
    title: 'Reps repeat the same questions',
    body: 'Budget, timeline, location — first-level qualification eats the hours that closing needs.',
  },
  {
    icon: 'i-refresh',
    title: 'Follow-ups slip through',
    body: 'Callbacks and second attempts depend on spreadsheets and memory, so some never happen.',
  },
  {
    icon: 'i-db',
    title: 'The CRM tells half the story',
    body: 'Call outcomes rarely make it back to the CRM, so managers cannot see which leads need attention.',
  },
];

export const outcomes = [
  'Qualify leads faster.',
  'Book more conversations.',
  'Give sales teams more time.',
] as const;

export interface Step {
  readonly title: string;
  readonly body: string;
}

export const howItWorks: readonly { readonly phase: string; readonly steps: readonly Step[] }[] = [
  {
    phase: 'Capture',
    steps: [
      {
        title: 'Import or capture leads',
        body: 'Upload Excel or CSV, pull from your CRM, or send leads in over the API.',
      },
      {
        title: 'Launch an AI voice campaign',
        body: 'Choose the AI agent, the leads, calling hours and pacing.',
      },
      {
        title: 'AI talks to the lead',
        body: 'A natural phone conversation in the lead’s language, with your questions.',
      },
    ],
  },
  {
    phase: 'Convert',
    steps: [
      {
        title: 'Qualify the lead',
        body: 'Answers are captured against the qualification rules you define.',
      },
      {
        title: 'Schedule the appointment',
        body: 'Interested leads can book a slot during the same call.',
      },
      {
        title: 'Escalate to a human when required',
        body: 'Live transfer to your team, or a scheduled callback.',
      },
    ],
  },
  {
    phase: 'Close the loop',
    steps: [
      {
        title: 'Transcript and AI summary',
        body: 'Every connected call is transcribed and summarised for your team.',
      },
      {
        title: 'Synchronise the CRM',
        body: 'Outcomes, notes and activities flow to your connected CRM.',
      },
      {
        title: 'Track usage and outcomes',
        body: 'Campaign results, call outcomes and usage in one dashboard.',
      },
    ],
  },
];

export const capabilities: readonly Feature[] = [
  {
    icon: 'i-phone',
    title: 'AI outbound voice calls',
    body: 'Campaigns call your leads within the hours and pacing you set — no manual dialling.',
  },
  {
    icon: 'i-target',
    title: 'Lead qualification',
    body: 'Your questions, asked consistently, with answers captured as structured data.',
  },
  {
    icon: 'i-cal',
    title: 'Appointment scheduling',
    body: 'Offers available slots, confirms the time back to the lead and records the booking.',
  },
  {
    icon: 'i-user',
    title: 'Human escalation',
    body: 'Live transfer to your team when a person is needed, or a scheduled callback.',
  },
  {
    icon: 'i-mic',
    title: 'Inbound call handling',
    body: 'Route calls on your Nivomi number to the AI, your team, or AI first then a person.',
  },
  {
    icon: 'i-chat',
    title: 'Transcripts and AI summaries',
    body: 'Searchable transcripts and a short summary of every connected call.',
  },
  {
    icon: 'i-layers',
    title: 'Lead ingestion',
    body: 'Excel / CSV upload, CRM import and API — every source lands in one lead list.',
  },
  {
    icon: 'i-refresh',
    title: 'CRM synchronisation',
    body: 'Calls, notes, outcomes and appointments sync back to your connected CRM.',
  },
  {
    icon: 'i-chart',
    title: 'Usage and analytics',
    body: 'Calls, connections, outcomes, appointments, transfers and usage per campaign.',
  },
];

export const outboundPipeline = [
  'Lead list',
  'Campaign',
  'AI voice call',
  'Conversation',
  'Qualification',
  'Outcome',
] as const;

export const outboundPoints: readonly string[] = [
  'Every call is checked first against consent, do-not-call lists and calling hours.',
  'Conversation state keeps track of what was asked and answered.',
  'Callers can interrupt the AI mid-sentence (barge-in), where supported by the call path.',
  'Appointments are booked in the call; transcripts, summaries and CRM updates follow.',
];

export const inboundModes: readonly Feature[] = [
  {
    icon: 'i-spark',
    title: 'AI answers',
    body: 'The AI agent greets the caller, answers from your approved information and qualifies.',
  },
  {
    icon: 'i-user',
    title: 'Your team answers',
    body: 'Calls ring your team in the order you choose, with Nivomi keeping the record.',
  },
  {
    icon: 'i-arrow-ur',
    title: 'AI first, then a person',
    body: 'The AI handles the start and brings in your team when the caller needs a person.',
  },
];

export const inboundPoints: readonly string[] = [
  'Business hours and after-hours behaviour: callback or voicemail where configured.',
  'Callers are matched to existing leads, or added as new ones.',
  'Transcripts, summaries and CRM sync work the same way as outbound calls.',
];

export const escalationTriggers: readonly string[] = [
  'The caller asks for a person',
  'The AI cannot answer confidently',
  'Repeated misunderstanding',
  'A complex request',
  'A high-priority lead, by your rules',
  'An appointment cannot be booked',
  'A provider or system failure',
  'Other rules you configure',
];

export interface DataSource {
  readonly icon: IconName;
  readonly title: string;
  readonly body: string;
}

export const dataSources: readonly DataSource[] = [
  {
    icon: 'i-layers',
    title: 'Excel / CSV',
    body: 'Upload a sheet, map the columns, preview and confirm. Duplicates and missing consent details are flagged before import.',
  },
  {
    icon: 'i-db',
    title: 'CRM / API',
    body: 'Connect your own CRM and import the leads you choose. HubSpot is the first supported CRM — connecting one is optional.',
  },
  {
    icon: 'i-link',
    title: 'Webhooks / API',
    body: 'Your website forms and other systems can send new leads to Nivomi, so they can be called quickly.',
  },
  {
    icon: 'i-refresh',
    title: 'CRM synchronisation',
    body: 'Call outcomes, summaries, activities and lead updates sync back to the connected CRM.',
  },
];

export const loopPipeline = ['Lead', 'Campaign', 'AI call', 'Outcome', 'CRM sync'] as const;

export interface Language {
  readonly name: string;
  readonly native: string;
  readonly code: string;
}

export const languages: readonly Language[] = [
  { name: 'English', native: 'English', code: 'en-IN' },
  { name: 'Hindi', native: 'हिन्दी', code: 'hi-IN' },
  { name: 'Malayalam', native: 'മലയാളം', code: 'ml-IN' },
  { name: 'Tamil', native: 'தமிழ்', code: 'ta-IN' },
  { name: 'Telugu', native: 'తెలుగు', code: 'te-IN' },
  { name: 'Kannada', native: 'ಕನ್ನಡ', code: 'kn-IN' },
];

export interface UseCase {
  readonly icon: IconName;
  readonly title: string;
  readonly body: string;
}

export const useCases: readonly UseCase[] = [
  {
    icon: 'i-building',
    title: 'Real estate',
    body: 'Call new property enquiries quickly, qualify budget and location, and book site visits.',
  },
  {
    icon: 'i-grad',
    title: 'Education and coaching',
    body: 'Follow up course enquiries, capture goals and timelines, and schedule counselling calls.',
  },
  {
    icon: 'i-zap',
    title: 'Automotive',
    body: 'Reach test-drive and showroom enquiries, confirm model interest and book visits.',
  },
  {
    icon: 'i-shield',
    title: 'Financial services',
    body: 'Where regulations permit: qualify enquiries and hand interested leads to licensed advisors.',
  },
  {
    icon: 'i-brief',
    title: 'Local and high-consideration services',
    body: 'Clinics, interiors, travel desks and more — any team that follows up many enquiries by phone.',
  },
];

export interface Plan {
  readonly name: string;
  readonly audience: string;
  readonly price: string;
  readonly cta: string;
  readonly highlighted?: boolean;
}

export const plans: readonly Plan[] = [
  {
    name: 'Starter',
    audience: 'For teams starting AI voice follow-up on a focused lead flow.',
    price: 'Pricing coming soon',
    cta: 'Talk to us',
  },
  {
    name: 'Growth',
    audience: 'For sales teams running campaigns across several lead sources and languages.',
    price: 'Pricing coming soon',
    cta: 'Talk to us',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    audience: 'For larger teams that need custom limits, integrations and onboarding.',
    price: 'Talk to us',
    cta: 'Contact sales',
  },
];

export const pricingModel: readonly { readonly title: string; readonly body: string }[] = [
  { title: 'Subscription', body: 'A monthly plan for your organisation.' },
  { title: 'Included usage', body: 'Call minutes included in every plan.' },
  { title: 'Metered overage', body: 'Usage beyond the plan, measured by the platform.' },
];

export interface IntegrationGroup {
  readonly title: string;
  readonly items: readonly {
    readonly name: string;
    readonly note: string;
    readonly soon?: boolean;
  }[];
}

export const integrationGroups: readonly IntegrationGroup[] = [
  {
    title: 'Lead sources and CRM',
    items: [
      { name: 'Excel / CSV', note: 'Upload and map' },
      { name: 'HubSpot', note: 'Your own account, optional' },
      { name: 'API and webhooks', note: 'Send leads from your systems' },
      { name: 'More CRMs', note: 'Salesforce, Zoho and others', soon: true },
    ],
  },
  {
    title: 'Voice and AI',
    items: [
      { name: 'Exotel', note: 'Telephony' },
      { name: 'Sarvam', note: 'Indian-language speech' },
      { name: 'Configurable LLMs', note: 'Chosen by evaluation' },
    ],
  },
  {
    title: 'Platform',
    items: [
      { name: 'AWS', note: 'Mumbai region' },
      { name: 'Clerk', note: 'Sign-in and organisations' },
      { name: 'Razorpay', note: 'Billing' },
    ],
  },
];

export const trustPoints: readonly Feature[] = [
  {
    icon: 'i-building',
    title: 'Separate by organisation',
    body: 'Every organisation’s leads, calls, numbers and CRM connection are kept apart by design.',
  },
  {
    icon: 'i-users',
    title: 'Role-based access',
    body: 'Owner, admin, manager, agent, analyst and viewer roles decide who sees and does what.',
  },
  {
    icon: 'i-shield',
    title: 'Compliance-aware calling',
    body: 'Designed around jurisdiction-specific calling requirements: consent, do-not-call, calling hours.',
  },
  {
    icon: 'i-server',
    title: 'Hosted in India',
    body: 'Built to run on AWS in the Mumbai region, with your data stored there.',
  },
  {
    icon: 'i-link',
    title: 'Customer-owned integrations',
    body: 'You connect your own CRM; credentials are stored encrypted and never shown again.',
  },
  {
    icon: 'i-check-c',
    title: 'Auditable actions',
    body: 'Sensitive and administrative actions are recorded in an audit trail.',
  },
];
