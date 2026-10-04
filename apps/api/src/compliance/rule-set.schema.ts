import {
  businessSectors,
  callCategories,
  consentBases,
  ruleSetStatuses,
  type BusinessSector,
  type CallCategory,
} from '@nivomi/database';
import { createHash } from 'node:crypto';
import { z } from 'zod';

/**
 * Schema of Rule Set data (ADR-021, schema version 1). Every regulatory value the
 * ComplianceEngine uses comes from data of this shape; none of it lives in code.
 */

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be HH:MM');

/** Where a rule comes from and how sure the research is (carried from research §8 R1). */
const meta = z.object({
  basis: z.array(z.string().min(1)).min(1),
  confidence: z.enum(['high', 'medium', 'low', 'draft']),
  note: z.string().optional(),
});

const window = z.object({ start: hhmm, end: hhmm }).refine((w) => w.start < w.end, {
  message: 'window start must be before end',
});

const category = z.enum(callCategories);
const basis = z.enum(consentBases);
const sector = z.enum(businessSectors);

export const preferenceRegistrations = ['NONE', 'FULLY_BLOCK', 'BLOCK_PROMO', 'CATEGORY'] as const;
export type PreferenceRegistration = (typeof preferenceRegistrations)[number];

export const ruleSetRulesSchema = z.object({
  schemaVersion: z.literal(1),
  /** Recipient-local time for calling windows and daily caps. */
  timezone: z.string().min(1),
  /** A recipient number with one of these country codes falls under this jurisdiction. */
  phoneCountryCodes: z.array(z.string().regex(/^\+\d{1,3}$/)).min(1),
  /** National-number prefixes of permitted commercial series; anything else is unknown. */
  numberSeries: z
    .array(
      z.object({
        id: z.string().min(1),
        prefix: z.string().regex(/^\d+$/),
        description: z.string(),
      }),
    )
    .min(1),
  callCategories: z.partialRecord(
    category,
    z.object({
      description: z.string(),
      /** Series ids a Caller Number must belong to. */
      allowedSeries: z.array(z.string()).min(1),
      /** Sector-specific series replacing `allowedSeries` (CR-9 overlays). */
      sectorSeries: z.partialRecord(sector, z.array(z.string()).min(1)).optional(),
      /** Recipient-local window; null = no regulatory time band. */
      callingWindow: window.nullable(),
      allowedConsentBases: z.array(basis).min(1),
      meta,
    }),
  ),
  consentBases: z.partialRecord(
    basis,
    z.object({
      /** Days from the evidence timestamp; null = no fixed expiry. */
      validityDays: z.number().int().positive().nullable(),
      requiresEvidenceTimestamp: z.boolean(),
      requiresOperatorReference: z.boolean(),
      /** May a call reach a number whose preferences block it? */
      overridesPreferences: z.boolean(),
      meta,
    }),
  ),
  preferences: z.object({
    /** Which registry states block which categories, and which bases are exempt. */
    blocks: z.array(
      z.object({
        registration: z.enum(['FULLY_BLOCK', 'BLOCK_PROMO', 'CATEGORY']),
        categories: z.array(category).min(1),
        exemptBases: z.array(basis),
      }),
    ),
    /** Organization sector → preference-registry content category (1–8). */
    sectorCategories: z.partialRecord(sector, z.number().int().min(1).max(8)),
    /** The result when the registry cannot be checked. Never ELIGIBLE. */
    unavailableResult: z.enum(['DEFERRED', 'REQUIRES_REVIEW']),
    meta,
  }),
  optOut: z.object({ reConsentBlockDays: z.number().int().positive(), meta }),
  complaints: z.object({
    breakerThreshold: z.number().int().positive(),
    windowDays: z.number().int().positive(),
    tripOnOperatorFlag: z.boolean(),
    meta,
  }),
  disclosures: z.object({
    aiDisclosureRequired: z.boolean(),
    recordingNoticeRequired: z.boolean(),
    meta,
  }),
  telecomIdentity: z.object({
    requireVerified: z.boolean(),
    requireA2PDeclaration: z.boolean(),
    selfCertificationValidityDays: z.number().int().positive(),
    meta,
  }),
  sectorOverlays: z.partialRecord(
    sector,
    z.object({ requiresReview: z.boolean(), reviewReason: z.string(), meta }),
  ),
  dpdp: z.object({
    /** From this instant, a call needs a DPDP consent entry for the person. */
    consentRequiredFrom: z.iso.datetime({ offset: true }),
    meta,
  }),
});

export type RuleSetRules = z.infer<typeof ruleSetRulesSchema>;

export const ruleSetDefinitionSchema = z.object({
  jurisdiction: z.string().regex(/^[A-Z]{2}$/),
  version: z.number().int().positive(),
  status: z.enum(ruleSetStatuses),
  effectiveFrom: z.iso.datetime({ offset: true }),
  effectiveTo: z.iso.datetime({ offset: true }).nullable(),
  reviewNote: z.string().nullable(),
  sources: z.array(z.object({ id: z.string(), title: z.string(), reference: z.string() })).min(1),
  rules: ruleSetRulesSchema,
});

export type RuleSetDefinition = z.infer<typeof ruleSetDefinitionSchema>;

/** A Rule Set as the engine sees it: validated rules plus the stored identity. */
export interface LoadedRuleSet {
  readonly id: string;
  readonly jurisdiction: string;
  readonly version: number;
  readonly status: RuleSetDefinition['status'];
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;
  readonly reviewNote: string | null;
  readonly sources: RuleSetDefinition['sources'];
  readonly rules: RuleSetRules;
}

/** Stable JSON (sorted keys) so the checksum does not depend on key order. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Checksum over everything that defines a version; a stored version must never change. */
export function ruleSetChecksum(definition: RuleSetDefinition): string {
  const { jurisdiction, version, status, effectiveFrom, effectiveTo, sources, rules } = definition;
  return createHash('sha256')
    .update(
      canonical({ jurisdiction, version, status, effectiveFrom, effectiveTo, sources, rules }),
    )
    .digest('hex');
}

export type { BusinessSector, CallCategory };
