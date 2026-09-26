/**
 * Future Nivomi products. None of these are available: every page and card renders them with a
 * COMING SOON badge, and every preview is labelled as an illustration with example content.
 * Planned connections are described generically — no third-party integration is claimed.
 */
import type { IconName } from './icons';

export interface PreviewMessage {
  readonly from: 'customer' | 'ai' | 'system';
  readonly text: string;
}

export type ProductPreview =
  | {
      readonly kind: 'chat';
      readonly channel: string;
      readonly messages: readonly PreviewMessage[];
    }
  | {
      readonly kind: 'pipeline';
      readonly title: string;
      readonly steps: readonly { readonly label: string; readonly detail: string }[];
    }
  | {
      readonly kind: 'analytics';
      readonly question: string;
      readonly answer: string;
      readonly bars: readonly { readonly label: string; readonly value: number }[];
    };

export interface ComingSoonProduct {
  readonly slug: string;
  readonly title: string;
  readonly seoTitle: string;
  readonly icon: IconName;
  readonly tagline: string;
  readonly description: string;
  readonly problem: { readonly title: string; readonly points: readonly string[] };
  readonly workflow: readonly string[];
  readonly capabilities: readonly { readonly title: string; readonly body: string }[];
  readonly benefits: readonly { readonly title: string; readonly body: string }[];
  readonly connections: readonly { readonly name: string; readonly note: string }[];
  readonly preview: ProductPreview;
}

export const comingSoonProducts: readonly ComingSoonProduct[] = [
  {
    slug: 'whatsapp-ai',
    title: 'WhatsApp AI Manager',
    seoTitle: 'Nivomi WhatsApp AI Manager | Coming Soon',
    icon: 'i-wa-line',
    tagline: 'Conversations on the channel your customers already use.',
    description:
      'An AI manager for WhatsApp that answers enquiries, qualifies leads, follows up and brings in your team when a person is needed — with every conversation recorded in Nivomi.',
    problem: {
      title: 'WhatsApp enquiries pile up',
      points: [
        'Customers message at all hours and expect a quick reply.',
        'The same questions are answered by hand, again and again.',
        'Conversations live on individual phones instead of the CRM.',
      ],
    },
    workflow: [
      'Customer',
      'WhatsApp',
      'AI conversation',
      'Qualification',
      'Appointment / follow-up',
      'Human escalation',
      'CRM',
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
    preview: {
      kind: 'chat',
      channel: 'WhatsApp',
      messages: [
        { from: 'customer', text: 'Hi, I need more information about the 2BHK units.' },
        {
          from: 'ai',
          text: 'Absolutely. Which location are you considering, and when are you planning to move?',
        },
        { from: 'customer', text: 'Kakkanad, within six months.' },
        { from: 'ai', text: 'Thanks! Would you like a site visit this Saturday or Sunday?' },
        { from: 'system', text: 'Lead qualified · Visit requested' },
      ],
    },
  },
  {
    slug: 'sms-automation',
    title: 'SMS Automation',
    seoTitle: 'Nivomi SMS Automation | Coming Soon',
    icon: 'i-sms',
    tagline: 'Reminders and follow-ups that go out on time.',
    description:
      'Automated SMS for follow-ups, appointment reminders and lead notifications, triggered by what happens in your Nivomi workflows and handled by AI or your team when leads reply.',
    problem: {
      title: 'Follow-up messages depend on someone remembering',
      points: [
        'Appointment reminders are sent late or not at all.',
        'Leads who missed a call get no written follow-up.',
        'Replies are scattered and never reach the CRM.',
      ],
    },
    workflow: ['Lead', 'Trigger', 'SMS', 'Response', 'AI / human', 'CRM'],
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
    preview: {
      kind: 'chat',
      channel: 'SMS',
      messages: [
        {
          from: 'ai',
          text: 'Reminder: your site visit is tomorrow at 11:00 AM. Reply 1 to confirm or 2 to reschedule.',
        },
        { from: 'customer', text: '2' },
        { from: 'ai', text: 'No problem. Our team will call you to find a new time.' },
        { from: 'system', text: 'Reschedule request · Task created for the team' },
      ],
    },
  },
  {
    slug: 'operations-ai',
    title: 'Operations AI',
    seoTitle: 'Nivomi Operations AI | Coming Soon',
    icon: 'i-flow',
    tagline: 'Routine operational work, handled with a person in the loop.',
    description:
      'An AI manager for internal operations: it watches business events, decides the next step within your rules, carries it out, checks the result and escalates anything unusual.',
    problem: {
      title: 'Operations run on reminders and chasing',
      points: [
        'Routine tasks wait until someone notices them.',
        'Exceptions are spotted late, after customers feel them.',
        'Handovers between teams lose context.',
      ],
    },
    workflow: [
      'Business event',
      'Operations AI',
      'Analyse',
      'Decide',
      'Execute',
      'Verify',
      'Human escalation',
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
    preview: {
      kind: 'pipeline',
      title: 'Example: overdue appointment follow-up',
      steps: [
        { label: 'Event', detail: 'Appointment marked no-show' },
        { label: 'AI analysis', detail: 'Lead is qualified; no callback scheduled' },
        { label: 'Action', detail: 'Create a callback task for the assigned rep' },
        { label: 'Verification', detail: 'Task accepted · reminder set' },
      ],
    },
  },
  {
    slug: 'analytics-ai',
    title: 'Analytics AI',
    seoTitle: 'Nivomi Analytics AI | Coming Soon',
    icon: 'i-trend',
    tagline: 'Ask questions about your campaigns in plain language.',
    description:
      'Conversational analytics for your Nivomi data: campaign insights, lead trends, call insights and anomalies, answered from your own organisation’s records.',
    problem: {
      title: 'Answers are buried in reports',
      points: [
        'Managers wait for someone to build the report they need.',
        'Trends and drops are noticed weeks late.',
        'Call insights stay locked inside transcripts.',
      ],
    },
    workflow: ['Your question', 'Analytics AI', 'Your Nivomi data', 'Insight', 'Visualisation'],
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
    preview: {
      kind: 'analytics',
      question: 'Which campaigns generated the most qualified leads this week?',
      answer: 'Example answer: “Site visits – Kochi” led, followed by “Course enquiries – Hindi”.',
      bars: [
        { label: 'Site visits – Kochi', value: 86 },
        { label: 'Course enquiries – Hindi', value: 64 },
        { label: 'Test drives – Pune', value: 41 },
        { label: 'Loan enquiries', value: 23 },
      ],
    },
  },
  {
    slug: 'hotel-automation',
    title: 'Hotel AI Automation',
    seoTitle: 'Nivomi Hotel AI Automation | Coming Soon',
    icon: 'i-bed',
    tagline: 'Guest calls and requests, answered around the clock.',
    description:
      'An AI workflow for hotels and hospitality teams: reservation enquiries, guest questions and service requests over calls and messages, with your staff brought in whenever needed.',
    problem: {
      title: 'The front desk cannot answer every call',
      points: [
        'Reservation calls go unanswered at busy times and at night.',
        'Guests repeat the same questions about timings and facilities.',
        'Service requests are noted on paper and forgotten.',
      ],
    },
    workflow: [
      'Guest',
      'Call / message',
      'AI',
      'Understand request',
      'Reservation / service',
      'Human escalation',
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
    preview: {
      kind: 'chat',
      channel: 'Guest call',
      messages: [
        { from: 'customer', text: 'Do you have a family room for two nights from the 14th?' },
        {
          from: 'ai',
          text: 'I can check that for you. How many adults and children will be staying?',
        },
        { from: 'customer', text: 'Two adults and one child.' },
        { from: 'system', text: 'Reservation request captured · Front desk notified' },
      ],
    },
  },
  {
    slug: 'logistics-automation',
    title: 'Logistics AI Automation',
    seoTitle: 'Nivomi Logistics AI Automation | Coming Soon',
    icon: 'i-truck',
    tagline: 'Shipment questions and delivery updates, handled.',
    description:
      'An AI workflow for logistics teams: shipment enquiries, delivery communication, status requests and operational notifications, with escalation when something goes wrong.',
    problem: {
      title: '“Where is my shipment?” all day long',
      points: [
        'Support teams answer the same status questions repeatedly.',
        'Customers hear about delays too late.',
        'Delivery issues are reported by phone and never logged.',
      ],
    },
    workflow: [
      'Customer / shipment event',
      'AI agent',
      'Understand',
      'Respond / notify',
      'Escalate if required',
      'System update',
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
    preview: {
      kind: 'pipeline',
      title: 'Example: delayed delivery',
      steps: [
        { label: 'Shipment event', detail: 'Delivery slot missed' },
        { label: 'AI agent', detail: 'Calls the customer to confirm a new slot' },
        { label: 'Respond', detail: 'New slot agreed for tomorrow' },
        { label: 'System update', detail: 'Status updated · dispatcher notified' },
      ],
    },
  },
];

export function getComingSoonProduct(slug: string): ComingSoonProduct | undefined {
  return comingSoonProducts.find((product) => product.slug === slug);
}
