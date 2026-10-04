/**
 * Canned response generator used by the browser voice demo while a real LLMProvider is not wired.
 * The demo is strictly out of scope for Nivomi's production voice path (ADR-011) — once a tenant-
 * scoped LLMRouter exists, swap this for a real call.
 */

interface Rule {
  readonly patterns: readonly RegExp[];
  readonly replies: readonly string[];
}

const RULES: readonly Rule[] = [
  {
    patterns: [/\b(hi|hello|hey|namaste|namaskar|hola|salaam)\b/i],
    replies: [
      'Hello! I am Nivomi, your A I voice agent. How can I help you today?',
      'Hi there! Welcome to Nivomi. What would you like to know?',
    ],
  },
  {
    patterns: [/\b(your name|who are you|what are you)\b/i],
    replies: [
      'I am Nivomi, an A I voice agent built for Indian businesses. I can make calls, take calls, and handle conversations in six languages.',
    ],
  },
  {
    patterns: [/\b(pricing|price|cost|how much|charges|plan)\b/i],
    replies: [
      'Our plans start at two thousand rupees per month for small teams, and scale with your call volume. Would you like our team to reach out?',
    ],
  },
  {
    patterns: [/\b(language|hindi|tamil|telugu|malayalam|kannada|english)\b/i],
    replies: [
      'Nivomi handles calls in English and five Indian languages: Hindi, Malayalam, Tamil, Telugu, and Kannada. We add more every quarter.',
    ],
  },
  {
    patterns: [/\b(demo|try|test|example)\b/i],
    replies: [
      'You are in the live demo right now. Try asking about pricing, languages, or how a campaign works.',
    ],
  },
  {
    patterns: [/\b(call|campaign|dial|outbound)\b/i],
    replies: [
      'Nivomi runs outbound campaigns against your contact list, respecting consent, D N D, and quiet hours automatically. The compliance engine checks every number before we dial.',
    ],
  },
  {
    patterns: [/\b(crm|hubspot|salesforce|zoho)\b/i],
    replies: [
      'We sync with HubSpot today, with Salesforce and Zoho on the roadmap. Your CRM stays authoritative for contacts; Nivomi tracks call outcomes back to it.',
    ],
  },
  {
    patterns: [/\b(bye|goodbye|thank you|thanks|that is all)\b/i],
    replies: [
      'Thank you for trying Nivomi! Reach out whenever you want to set up your own voice agent.',
    ],
  },
];

const FALLBACKS: readonly string[] = [
  'That is interesting. Could you tell me a bit more about what you are looking for?',
  'Got it. Would you like me to share pricing, languages, or how a campaign works?',
  'I hear you. Is there a specific feature you want to learn about?',
];

export function stubReply(prompt: string): string {
  const trimmed = prompt.trim();
  if (!trimmed) return 'I did not catch that — could you say it again?';
  for (const { patterns, replies } of RULES) {
    if (patterns.some((pattern) => pattern.test(trimmed))) {
      return pick(replies);
    }
  }
  return pick(FALLBACKS);
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}
