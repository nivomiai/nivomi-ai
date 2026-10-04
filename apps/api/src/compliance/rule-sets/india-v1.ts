import type { RuleSetDefinition } from '../rule-set.schema.js';

/**
 * India Rule Set, version 1 — DRAFT, pending review by Indian telecom and privacy counsel.
 *
 * Source: recommendation R1 of the India compliance research (2026-09-25), which cites the TRAI
 * instruments listed in `sources`. Source ids ([1], [2]…) match that report's appendix.
 *
 * A published version is immutable: the RuleSetRegistry refuses to start if the stored checksum
 * differs from this file. To change a rule, add `india-v2.ts` with its own effective date.
 */
export const INDIA_RULE_SET_V1: RuleSetDefinition = {
  jurisdiction: 'IN',
  version: 1,
  status: 'DRAFT',
  // TCCCPR Second Amendment in force (30 days after notification on 12 Feb 2025). The Third
  // Amendment has no Gazette date yet (VQ-12); v1 already applies its stricter readings (7-day
  // inquiry window, 1601xx for service calls) as conservative defaults.
  effectiveFrom: '2025-03-14T00:00:00+05:30',
  effectiveTo: null,
  reviewNote:
    'Draft pending legal review by Indian telecom and privacy counsel (VQ-3, VQ-4, VQ-6). The Third Amendment Gazette date (VQ-12) will produce version 2 with exact effective dates.',
  sources: [
    {
      id: 'research-2026-09-25',
      title: 'Domain research: India compliance for AI outbound sales calling (R1)',
      reference:
        'docs/planning/research/domain-india-ai-outbound-calling-compliance-2026-09-25/research.md',
    },
    {
      id: '[1]',
      title: 'TRAI TCCCPR Second Amendment (1 of 2025) and explanatory memorandum',
      reference: 'https://trai.gov.in/sites/default/files/2025-02/Regulation_12022025.pdf',
    },
    {
      id: '[2]',
      title: 'TRAI TCCCPR Third Amendment (05 of 2026), adopted 18 Sep 2026, not yet notified',
      reference: 'https://www.trai.gov.in/sites/default/files/2026-09/Regulation_18092026.pdf',
    },
    {
      id: '[4]',
      title: 'TRAI consultation: draft Third Amendment and consolidated TCCCPR (time bands)',
      reference: 'https://www.trai.gov.in/sites/default/files/2026-03/Draft_CP_13032026_0.pdf',
    },
    {
      id: '[5]',
      title: 'MediaNama: Third Amendment timelines, series protection and complaint thresholds',
      reference: 'https://www.medianama.com/2026/09/223-trai-truecaller-140-1600-calls-spam-rules/',
    },
    {
      id: '[7]',
      title: 'Sigma Chambers: sanctions, 90-day re-consent and 7-day service consent',
      reference:
        'https://www.sigmachambers.in/post/2025-tcccpr-amendments-a-renewed-push-by-trai-for-order-in-commercial-communications-1',
    },
    {
      id: '[8]',
      title: 'TRAI Direction: 1600-series for RBI, SEBI and PFRDA regulated entities (PR 135/2025)',
      reference:
        'https://trai.gov.in/notifications/press-release/trai-issues-direction-mandating-phase-wise-adoption-1600-series-bfsi',
    },
    {
      id: '[17]',
      title: 'Caller Digital: RBI collection-call window (vendor source, low confidence)',
      reference: 'https://www.caller.digital/blog/voice-ai-india-regulatory-map-2026',
    },
    {
      id: '[18]',
      title: 'CCPA draft guidelines on pesky and unsolicited commercial communications, 2026',
      reference:
        'https://www.medianama.com/wp-content/uploads/2026/09/Draft-of-Guidelines-for-Prevention-and-Regulaation-of-Pesky-Promotional-and-Unsolicited-Commercial-Communications-1.pdf',
    },
    {
      id: '[29]',
      title: 'Digital Personal Data Protection Act 2023 and Rules 2025',
      reference: 'research §3 (DPDP timeline and obligations)',
    },
  ],
  rules: {
    schemaVersion: 1,
    timezone: 'Asia/Kolkata',
    phoneCountryCodes: ['+91'],
    numberSeries: [
      { id: '140', prefix: '140', description: '140xx — promotional voice calls' },
      {
        id: '1600',
        prefix: '1600',
        description: '1600xx — service/transactional, BFSI and government',
      },
      { id: '1601', prefix: '1601', description: '1601xx — service/transactional, other sectors' },
    ],
    callCategories: {
      PROMOTIONAL: {
        description: 'Any sales or qualification content makes a call promotional (CR-1).',
        allowedSeries: ['140'],
        callingWindow: { start: '10:00', end: '21:00' },
        allowedConsentBases: ['INQUIRY', 'APPLICATION', 'REGISTERED_CONSENT', 'EXISTING_CUSTOMER'],
        meta: {
          basis: ['[1]', '[2]', '[4]'],
          confidence: 'medium',
          note: 'Time bands 21:00–10:00 are closed to promotional calls by default [4].',
        },
      },
      SERVICE: {
        description: 'About a product already procured, or an ongoing purchase with consent.',
        allowedSeries: ['1601'],
        sectorSeries: { BFSI: ['1600'] },
        callingWindow: null,
        allowedConsentBases: ['INQUIRY', 'APPLICATION', 'REGISTERED_CONSENT', 'EXISTING_CUSTOMER'],
        meta: {
          basis: ['[1]', '[2]', '[8]'],
          confidence: 'medium',
          note: 'Service calls cannot be blocked by time band [4]; 1601xx for non-BFSI is TRAI text only.',
        },
      },
      TRANSACTIONAL: {
        description: 'In response to a customer-initiated transaction within 30 minutes.',
        allowedSeries: ['1601'],
        sectorSeries: { BFSI: ['1600'] },
        callingWindow: null,
        allowedConsentBases: ['EXISTING_CUSTOMER', 'REGISTERED_CONSENT'],
        meta: { basis: ['[1]', '[2]'], confidence: 'medium' },
      },
    },
    consentBases: {
      INQUIRY: {
        validityDays: 7,
        requiresEvidenceTimestamp: true,
        requiresOperatorReference: false,
        overridesPreferences: false,
        meta: {
          basis: ['[2]'],
          confidence: 'medium',
          note: 'Inferred consent for 7 days; does not override DND until counsel confirms (VQ-4).',
        },
      },
      APPLICATION: {
        validityDays: 90,
        requiresEvidenceTimestamp: true,
        requiresOperatorReference: false,
        overridesPreferences: false,
        meta: { basis: ['[2]'], confidence: 'medium', note: 'Three months after an application.' },
      },
      REGISTERED_CONSENT: {
        validityDays: null,
        requiresEvidenceTimestamp: false,
        requiresOperatorReference: true,
        overridesPreferences: true,
        meta: {
          basis: ['[1]', '[2]'],
          confidence: 'high',
          note: 'Registered explicit consent (Digital Consent Acquisition) reaches blocked numbers.',
        },
      },
      EXISTING_CUSTOMER: {
        validityDays: null,
        requiresEvidenceTimestamp: false,
        requiresOperatorReference: false,
        overridesPreferences: false,
        meta: { basis: ['[1]'], confidence: 'medium' },
      },
    },
    preferences: {
      blocks: [
        {
          registration: 'FULLY_BLOCK',
          categories: ['PROMOTIONAL', 'SERVICE'],
          // Service calls to existing customers rely on inferred consent, which FULLY BLOCK allows.
          exemptBases: ['EXISTING_CUSTOMER'],
        },
        { registration: 'BLOCK_PROMO', categories: ['PROMOTIONAL'], exemptBases: [] },
        { registration: 'CATEGORY', categories: ['PROMOTIONAL'], exemptBases: [] },
      ],
      sectorCategories: {
        BFSI: 1,
        REAL_ESTATE: 2,
        EDUCATION: 3,
        HEALTH: 4,
        CONSUMER_GOODS_AUTOMOBILES: 5,
        COMMUNICATION_IT_ENTERTAINMENT: 6,
        TOURISM_LEISURE: 7,
        FOOD_BEVERAGES: 8,
      },
      unavailableResult: 'DEFERRED',
      meta: { basis: ['[1]'], confidence: 'medium' },
    },
    optOut: { reConsentBlockDays: 90, meta: { basis: ['[1]', '[7]'], confidence: 'high' } },
    complaints: {
      // Well below TRAI's 3 (with a flag) / 5 complaints in 10 days (PRD A-21).
      breakerThreshold: 2,
      windowDays: 10,
      tripOnOperatorFlag: true,
      meta: { basis: ['[2]', '[5]'], confidence: 'high' },
    },
    disclosures: {
      aiDisclosureRequired: true,
      recordingNoticeRequired: true,
      meta: {
        basis: ['[18]', '[29]'],
        confidence: 'draft',
        note: 'CCPA draft and good practice; no binding rule today (CR-10).',
      },
    },
    telecomIdentity: {
      requireVerified: true,
      requireA2PDeclaration: true,
      selfCertificationValidityDays: 365,
      meta: { basis: ['[1]', '[2]'], confidence: 'high' },
    },
    sectorOverlays: {
      BFSI: {
        requiresReview: true,
        reviewReason:
          'BFSI calling windows and recording rules (RBI, IRDAI) are unconfirmed; OD-5 is open.',
        meta: { basis: ['[8]', '[17]'], confidence: 'low' },
      },
    },
    dpdp: {
      consentRequiredFrom: '2027-05-13T00:00:00+05:30',
      meta: {
        basis: ['[29]'],
        confidence: 'medium',
        note: 'Planning date for DPDP obligations; confirm before relying on it.',
      },
    },
  },
};
