/**
 * Future Nivomi products. None of these are available: every page and card renders them with a
 * COMING SOON badge, and every preview is labelled as an illustration with example content.
 * Planned connections are described generically — no third-party integration is claimed.
 */
import type { IconName } from './icons';

export type AccentName = 'green' | 'sky' | 'amber' | 'indigo' | 'teal' | 'orange';

export interface PreviewMessage {
  readonly from: 'customer' | 'ai' | 'system';
  readonly text: string;
}

/** Product-specific mockup shown in the hero. All values are illustrative. */
export type ProductPreview =
  | {
      readonly kind: 'whatsapp';
      readonly business: string;
      readonly messages: readonly PreviewMessage[];
      readonly quickReplies: readonly string[];
    }
  | {
      readonly kind: 'sms';
      readonly sender: string;
      readonly messages: readonly PreviewMessage[];
      readonly trigger: { readonly when: string; readonly action: string };
    }
  | {
      readonly kind: 'operations';
      readonly columns: readonly {
        readonly title: string;
        readonly cards: readonly {
          readonly title: string;
          readonly detail: string;
          readonly tone?: 'approval' | 'done';
        }[];
      }[];
    }
  | {
      readonly kind: 'analytics';
      readonly question: string;
      readonly answer: string;
      readonly kpis: readonly { readonly label: string; readonly value: string }[];
      readonly bars: readonly { readonly label: string; readonly value: number }[];
      readonly trend: readonly number[];
    }
  | {
      readonly kind: 'hotel';
      readonly call: { readonly title: string; readonly detail: string; readonly time: string };
      readonly tickets: readonly {
        readonly request: string;
        readonly team: string;
        readonly status: 'routed' | 'captured' | 'needs-staff';
      }[];
    }
  | {
      readonly kind: 'logistics';
      readonly trackingId: string;
      readonly stops: readonly {
        readonly label: string;
        readonly detail: string;
        readonly state: 'done' | 'issue' | 'current' | 'next';
      }[];
      readonly notice: string;
    };

export interface ComingSoonProduct {
  readonly slug: string;
  readonly title: string;
  readonly seoTitle: string;
  readonly icon: IconName;
  readonly accent: AccentName;
  readonly tagline: string;
  readonly description: string;
  /** Three short planned highlights shown under the hero. */
  readonly highlights: readonly string[];
  readonly problem: { readonly title: string; readonly points: readonly string[] };
  /** Planned outcomes, shown opposite the problem ("With this product"). */
  readonly outcomes: readonly string[];
  readonly workflow: readonly { readonly label: string; readonly icon: IconName }[];
  readonly capabilities: readonly { readonly title: string; readonly body: string }[];
  readonly benefits: readonly { readonly title: string; readonly body: string }[];
  readonly connections: readonly { readonly name: string; readonly note: string }[];
  readonly faq: readonly { readonly q: string; readonly a: string }[];
  readonly preview: ProductPreview;
}

const launchFaq = (title: string) =>
  [
    {
      q: `When will ${title} be available?`,
      a: 'There is no public date yet. It follows the AI voice launch — register your interest and we will tell you when early access opens.',
    },
    {
      q: 'Can I use Nivomi today?',
      a: 'Yes. Nivomi AI voice automation for sales teams — outbound and inbound calls, qualification, appointments, human handoff and CRM sync — is in early access.',
    },
  ] as const;

export const comingSoonProducts: readonly ComingSoonProduct[] = [
  {
    slug: 'whatsapp-ai',
    title: 'WhatsApp AI Manager',
    seoTitle: 'Nivomi WhatsApp AI Manager | Coming Soon',
    icon: 'i-wa-line',
    accent: 'green',
    tagline: 'Conversations on the channel your customers already use.',
    description:
      'An AI manager for WhatsApp that answers enquiries, qualifies leads, follows up and brings in your team when a person is needed — with every conversation recorded in Nivomi.',
    highlights: ['Replies around the clock', 'Qualifies in chat', 'Hands over to your team'],
    problem: {
      title: 'WhatsApp enquiries pile up',
      points: [
        'Customers message at all hours and expect a quick reply.',
        'The same questions are answered by hand, again and again.',
        'Conversations live on individual phones instead of the CRM.',
      ],
    },
    outcomes: [
      'Every enquiry gets a prompt, on-brand first reply.',
      'Qualification answers are captured as structured data.',
      'Chats and calls sit on one lead record in Nivomi.',
    ],
    workflow: [
      { label: 'Customer', icon: 'i-user' },
      { label: 'WhatsApp', icon: 'i-wa-line' },
      { label: 'AI conversation', icon: 'i-chat' },
      { label: 'Qualification', icon: 'i-target' },
      { label: 'Appointment / follow-up', icon: 'i-cal' },
      { label: 'Human escalation', icon: 'i-users' },
      { label: 'CRM', icon: 'i-refresh' },
    ],
    capabilities: [
      {
        title: 'Inbound conversations',
        body: 'Reply to new enquiries with your approved information.',
      },
      {
        title: 'Lead engagement and qualification',
        body: 'Ask your qualification questions in chat.',
      },
      { title: 'Follow-up', body: 'Nudge leads who went quiet, within the rules you set.' },
      {
        title: 'Appointment conversations',
        body: 'Offer and confirm slots inside the conversation.',
      },
      { title: 'AI-assisted responses', body: 'Suggested replies your team can review and send.' },
      { title: 'Human escalation', body: 'Hand the chat to a person when it needs one.' },
    ],
    benefits: [
      { title: 'Faster first replies', body: 'Enquiries get an answer while interest is high.' },
      { title: 'One record per customer', body: 'Chats and calls sit together in Nivomi.' },
      {
        title: 'Your team stays in control',
        body: 'Escalation rules decide when a person steps in.',
      },
    ],
    connections: [
      { name: 'WhatsApp Business Platform', note: 'Planned channel' },
      { name: 'Nivomi lead list', note: 'Shared with voice campaigns' },
      { name: 'Your connected CRM', note: 'Conversation sync' },
    ],
    faq: [
      ...launchFaq('WhatsApp AI Manager'),
      {
        q: 'Will it use my existing WhatsApp number?',
        a: 'It is planned to work through the WhatsApp Business Platform. Number and approval requirements will be confirmed before launch.',
      },
    ],
    preview: {
      kind: 'whatsapp',
      business: 'Kochi Homes',
      messages: [
        { from: 'customer', text: 'Hi, I need more information about the 2BHK units.' },
        {
          from: 'ai',
          text: 'Happy to help! Which location are you considering, and when do you plan to move?',
        },
        { from: 'customer', text: 'Kakkanad, within six months.' },
        { from: 'ai', text: 'Great. Would you like a site visit this Saturday or Sunday?' },
        { from: 'system', text: 'Lead qualified · Visit requested' },
      ],
      quickReplies: ['Saturday 11 AM', 'Share brochure', 'Talk to a person'],
    },
  },
  {
    slug: 'sms-automation',
    title: 'SMS Automation',
    seoTitle: 'Nivomi SMS Automation | Coming Soon',
    icon: 'i-sms',
    accent: 'sky',
    tagline: 'Reminders and follow-ups that go out on time.',
    description:
      'Automated SMS for follow-ups, appointment reminders and lead notifications, triggered by what happens in your Nivomi workflows and handled by AI or your team when leads reply.',
    highlights: ['Triggered by your workflows', 'Registered templates', 'Replies on record'],
    problem: {
      title: 'Follow-up messages depend on someone remembering',
      points: [
        'Appointment reminders are sent late or not at all.',
        'Leads who missed a call get no written follow-up.',
        'Replies are scattered and never reach the CRM.',
      ],
    },
    outcomes: [
      'Reminders go out automatically before every appointment.',
      'Missed calls get a written next step.',
      'Replies are routed to AI or your team and synced.',
    ],
    workflow: [
      { label: 'Lead', icon: 'i-user' },
      { label: 'Trigger', icon: 'i-zap' },
      { label: 'SMS', icon: 'i-sms' },
      { label: 'Response', icon: 'i-chat' },
      { label: 'AI / human', icon: 'i-users' },
      { label: 'CRM', icon: 'i-refresh' },
    ],
    capabilities: [
      { title: 'Follow-up messages', body: 'Send a follow-up after a missed or completed call.' },
      { title: 'Appointment reminders', body: 'Remind leads before a booked appointment.' },
      { title: 'Lead notifications', body: 'Tell your team when a lead needs attention.' },
      {
        title: 'Campaign messaging',
        body: 'Messages as part of a wider campaign, within the rules.',
      },
      { title: 'Workflow triggers', body: 'Send when a status, outcome or appointment changes.' },
      { title: 'AI-assisted messaging', body: 'Suggested wording for replies and follow-ups.' },
    ],
    benefits: [
      { title: 'Fewer missed appointments', body: 'Timely reminders keep bookings on track.' },
      { title: 'Consistent follow-up', body: 'Every lead gets the same next step.' },
      { title: 'Replies on record', body: 'Responses sync to the lead and the CRM.' },
    ],
    connections: [
      { name: 'Registered SMS sender', note: 'DLT-registered templates' },
      { name: 'Nivomi workflows', note: 'Triggers from calls and appointments' },
      { name: 'Your connected CRM', note: 'Message and reply sync' },
    ],
    faq: [
      ...launchFaq('SMS Automation'),
      {
        q: 'Do SMS messages need DLT registration?',
        a: 'Yes. In India, business SMS needs DLT-registered headers and templates. Setting these up will be part of onboarding.',
      },
    ],
    preview: {
      kind: 'sms',
      sender: 'AD-KCHOME',
      messages: [
        {
          from: 'ai',
          text: 'Reminder: your site visit is tomorrow at 11:00 AM. Reply 1 to confirm or 2 to reschedule.',
        },
        { from: 'customer', text: '2' },
        { from: 'ai', text: 'No problem. Our team will call you to find a new time.' },
      ],
      trigger: {
        when: 'Appointment in 24 hours',
        action: 'Reminder sent · reply routed to the team',
      },
    },
  },
  {
    slug: 'operations-ai',
    title: 'Operations AI',
    seoTitle: 'Nivomi Operations AI | Coming Soon',
    icon: 'i-flow',
    accent: 'amber',
    tagline: 'Routine operational work, handled with a person in the loop.',
    description:
      'An AI manager for internal operations: it watches business events, decides the next step within your rules, carries it out, checks the result and escalates anything unusual.',
    highlights: [
      'Watches business events',
      'Acts within your rules',
      'Asks before sensitive steps',
    ],
    problem: {
      title: 'Operations run on reminders and chasing',
      points: [
        'Routine tasks wait until someone notices them.',
        'Exceptions are spotted late, after customers feel them.',
        'Handovers between teams lose context.',
      ],
    },
    outcomes: [
      'Routine steps run as soon as the event happens.',
      'Exceptions reach the right person with context.',
      'Sensitive actions wait for a human approval.',
    ],
    workflow: [
      { label: 'Business event', icon: 'i-zap' },
      { label: 'Operations AI', icon: 'i-spark' },
      { label: 'Analyse', icon: 'i-target' },
      { label: 'Decide', icon: 'i-flow' },
      { label: 'Execute', icon: 'i-check-c' },
      { label: 'Verify', icon: 'i-shield' },
      { label: 'Human escalation', icon: 'i-users' },
    ],
    capabilities: [
      { title: 'Workflow automation', body: 'Run repeatable steps when an event happens.' },
      { title: 'Internal notifications', body: 'Tell the right person, with context.' },
      { title: 'Process monitoring', body: 'Watch for work that is stuck or overdue.' },
      { title: 'Exception handling', body: 'Route unusual cases to a person instead of guessing.' },
      { title: 'Task orchestration', body: 'Create, assign and follow up tasks across teams.' },
      { title: 'Operational insights', body: 'See where work slows down.' },
    ],
    benefits: [
      { title: 'Less manual chasing', body: 'Routine steps happen without reminders.' },
      { title: 'Earlier exceptions', body: 'Problems surface before customers notice.' },
      { title: 'Approval-aware', body: 'Sensitive actions wait for a person to approve.' },
    ],
    connections: [
      { name: 'Nivomi events', note: 'Calls, leads and appointments' },
      { name: 'Webhooks and APIs', note: 'Your internal systems' },
      { name: 'Team notifications', note: 'Email and in-app' },
    ],
    faq: [
      ...launchFaq('Operations AI'),
      {
        q: 'Can the AI take actions without approval?',
        a: 'Only the actions you allow. Sensitive actions are planned to wait for a person’s approval.',
      },
    ],
    preview: {
      kind: 'operations',
      columns: [
        {
          title: 'Detected',
          cards: [
            { title: 'Appointment no-show', detail: 'Qualified lead · no callback set' },
            { title: 'Lead unassigned for 2 days', detail: 'Campaign: Site visits' },
          ],
        },
        {
          title: 'In progress',
          cards: [{ title: 'Callback task created', detail: 'Assigned to the lead owner' }],
        },
        {
          title: 'Needs approval',
          cards: [
            { title: 'Refund request', detail: 'Waiting for a manager', tone: 'approval' },
            { title: 'Reminder sent', detail: 'Verified · done', tone: 'done' },
          ],
        },
      ],
    },
  },
  {
    slug: 'analytics-ai',
    title: 'Analytics AI',
    seoTitle: 'Nivomi Analytics AI | Coming Soon',
    icon: 'i-trend',
    accent: 'indigo',
    tagline: 'Ask questions about your campaigns in plain language.',
    description:
      'Conversational analytics for your Nivomi data: campaign insights, lead trends, call insights and anomalies, answered from your own organisation’s records.',
    highlights: ['Ask in plain language', 'Answers with charts', 'Your data only'],
    problem: {
      title: 'Answers are buried in reports',
      points: [
        'Managers wait for someone to build the report they need.',
        'Trends and drops are noticed weeks late.',
        'Call insights stay locked inside transcripts.',
      ],
    },
    outcomes: [
      'Everyday questions answered in seconds, with a chart.',
      'Unusual drops and spikes flagged for review.',
      'Objections and questions surfaced from transcripts.',
    ],
    workflow: [
      { label: 'Your question', icon: 'i-chat' },
      { label: 'Analytics AI', icon: 'i-spark' },
      { label: 'Your Nivomi data', icon: 'i-db' },
      { label: 'Insight', icon: 'i-trend' },
      { label: 'Visualisation', icon: 'i-chart' },
    ],
    capabilities: [
      {
        title: 'Conversational analytics',
        body: 'Ask in plain language; get an answer with a chart.',
      },
      { title: 'Campaign insights', body: 'Compare campaigns, languages and time periods.' },
      { title: 'Lead trends', body: 'See how qualification and interest change over time.' },
      { title: 'Call insights', body: 'Common objections and questions from transcripts.' },
      { title: 'Performance analysis', body: 'Connection, qualification and appointment rates.' },
      { title: 'Anomaly detection', body: 'Flags unusual drops or spikes for review.' },
    ],
    benefits: [
      { title: 'Answers without waiting', body: 'No report request for everyday questions.' },
      { title: 'Grounded in your data', body: 'Only your organisation’s records are used.' },
      { title: 'Spot issues early', body: 'Changes are highlighted as they happen.' },
    ],
    connections: [
      { name: 'Nivomi campaigns and calls', note: 'Your organisation only' },
      { name: 'Usage records', note: 'Cost and volume' },
      { name: 'Exports', note: 'Share results with your team' },
    ],
    faq: [
      ...launchFaq('Analytics AI'),
      {
        q: 'Which data will it use?',
        a: 'Only your organisation’s Nivomi data — campaigns, calls, outcomes and usage. No other customer’s data is ever used.',
      },
    ],
    preview: {
      kind: 'analytics',
      question: 'Which campaigns generated the most qualified leads this week?',
      answer: '“Site visits – Kochi” led, followed by “Course enquiries – Hindi”.',
      kpis: [
        { label: 'Calls', value: '1,240' },
        { label: 'Qualified', value: '186' },
        { label: 'Appointments', value: '74' },
      ],
      bars: [
        { label: 'Site visits – Kochi', value: 86 },
        { label: 'Course enquiries – Hindi', value: 64 },
        { label: 'Test drives – Pune', value: 41 },
        { label: 'Loan enquiries', value: 23 },
      ],
      trend: [12, 18, 15, 22, 27, 24, 31],
    },
  },
  {
    slug: 'hotel-automation',
    title: 'Hotel AI Automation',
    seoTitle: 'Nivomi Hotel AI Automation | Coming Soon',
    icon: 'i-bed',
    accent: 'teal',
    tagline: 'Guest calls and requests, answered around the clock.',
    description:
      'An AI workflow for hotels and hospitality teams: reservation enquiries, guest questions and service requests over calls and messages, with your staff brought in whenever needed.',
    highlights: [
      'Answers when the desk is busy',
      'Routes guest requests',
      'Staff always a step away',
    ],
    problem: {
      title: 'The front desk cannot answer every call',
      points: [
        'Reservation calls go unanswered at busy times and at night.',
        'Guests repeat the same questions about timings and facilities.',
        'Service requests are noted on paper and forgotten.',
      ],
    },
    outcomes: [
      'Every call gets an answer, day or night.',
      'Requests reach the right team as trackable tickets.',
      'Staff step in for anything the AI should not handle.',
    ],
    workflow: [
      { label: 'Guest', icon: 'i-user' },
      { label: 'Call / message', icon: 'i-phone' },
      { label: 'AI', icon: 'i-spark' },
      { label: 'Understand request', icon: 'i-target' },
      { label: 'Reservation / service', icon: 'i-bed' },
      { label: 'Human escalation', icon: 'i-users' },
    ],
    capabilities: [
      {
        title: 'Reservation enquiries',
        body: 'Collect dates, guests and preferences for your team.',
      },
      { title: 'Guest inquiries', body: 'Answer common questions from approved information.' },
      { title: 'Service requests', body: 'Capture and route requests to the right staff.' },
      { title: 'Inbound calls', body: 'Answer calls when the desk is busy or closed.' },
      { title: 'Follow-up', body: 'Confirm details and remind guests before arrival.' },
      {
        title: 'Human escalation',
        body: 'Transfer to staff for anything the AI should not handle.',
      },
    ],
    benefits: [
      { title: 'No missed enquiries', body: 'Every call gets an answer, day or night.' },
      { title: 'Staff focus on guests', body: 'Routine questions are handled for them.' },
      { title: 'Requests tracked', body: 'Nothing depends on a sticky note.' },
    ],
    connections: [
      { name: 'Your phone line', note: 'Via Nivomi numbers' },
      { name: 'Property systems', note: 'To be scoped with pilot customers' },
      { name: 'Staff notifications', note: 'Email and in-app' },
    ],
    faq: [
      ...launchFaq('Hotel AI Automation'),
      {
        q: 'Will it connect to my property management system?',
        a: 'Integrations will be scoped with pilot customers. No specific property system is supported yet.',
      },
    ],
    preview: {
      kind: 'hotel',
      call: {
        title: 'Incoming call · Guest',
        detail: 'Family room for 2 nights from the 14th',
        time: '02:14 AM',
      },
      tickets: [
        {
          request: 'Reservation request · 2 adults, 1 child',
          team: 'Front desk',
          status: 'routed',
        },
        { request: 'Extra towels · Room 204', team: 'Housekeeping', status: 'captured' },
        { request: 'Late checkout · Room 311', team: 'Duty manager', status: 'needs-staff' },
      ],
    },
  },
  {
    slug: 'logistics-automation',
    title: 'Logistics AI Automation',
    seoTitle: 'Nivomi Logistics AI Automation | Coming Soon',
    icon: 'i-truck',
    accent: 'orange',
    tagline: 'Shipment questions and delivery updates, handled.',
    description:
      'An AI workflow for logistics teams: shipment enquiries, delivery communication, status requests and operational notifications, with escalation when something goes wrong.',
    highlights: ['Answers status questions', 'Calls about delays', 'Logs every issue'],
    problem: {
      title: '“Where is my shipment?” all day long',
      points: [
        'Support teams answer the same status questions repeatedly.',
        'Customers hear about delays too late.',
        'Delivery issues are reported by phone and never logged.',
      ],
    },
    outcomes: [
      'Status questions answered from your shipment data.',
      'Customers hear about delays before they ask.',
      'Every reported issue is logged and routed.',
    ],
    workflow: [
      { label: 'Customer / shipment event', icon: 'i-truck' },
      { label: 'AI agent', icon: 'i-spark' },
      { label: 'Understand', icon: 'i-target' },
      { label: 'Respond / notify', icon: 'i-phone' },
      { label: 'Escalate if required', icon: 'i-users' },
      { label: 'System update', icon: 'i-refresh' },
    ],
    capabilities: [
      { title: 'Shipment inquiries', body: 'Answer status questions from your systems.' },
      { title: 'Delivery communication', body: 'Confirm slots and addresses with customers.' },
      { title: 'Customer follow-up', body: 'Call back after failed or delayed deliveries.' },
      { title: 'Status requests', body: 'Self-service answers over calls and messages.' },
      { title: 'Operational notifications', body: 'Alert your team to delays and exceptions.' },
      { title: 'Escalation', body: 'Bring in a person for damaged or disputed deliveries.' },
    ],
    benefits: [
      { title: 'Lighter support load', body: 'Routine status questions answered automatically.' },
      { title: 'Proactive updates', body: 'Customers hear about changes early.' },
      { title: 'Issues on record', body: 'Every reported problem is logged.' },
    ],
    connections: [
      { name: 'Your shipment data', note: 'To be scoped with pilot customers' },
      { name: 'Webhooks and APIs', note: 'Status events in, updates out' },
      { name: 'Nivomi voice', note: 'Calls and callbacks' },
    ],
    faq: [
      ...launchFaq('Logistics AI Automation'),
      {
        q: 'Which tracking systems will it connect to?',
        a: 'Integrations will be scoped with pilot customers through webhooks and APIs. No specific system is supported yet.',
      },
    ],
    preview: {
      kind: 'logistics',
      trackingId: 'SHP-48213',
      stops: [
        { label: 'Picked up', detail: 'Kochi hub · Mon 09:10', state: 'done' },
        { label: 'In transit', detail: 'Coimbatore · Mon 18:40', state: 'done' },
        { label: 'Delivery slot missed', detail: 'Customer not reachable', state: 'issue' },
        { label: 'Rescheduled', detail: 'AI called · new slot Tue 10–12', state: 'current' },
        { label: 'Delivered', detail: 'Pending', state: 'next' },
      ],
      notice: 'Customer called · new slot agreed · dispatcher notified',
    },
  },
];

export function getComingSoonProduct(slug: string): ComingSoonProduct | undefined {
  return comingSoonProducts.find((product) => product.slug === slug);
}
