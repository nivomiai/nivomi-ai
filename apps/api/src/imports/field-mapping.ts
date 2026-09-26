import type { IngestionInput } from '../leads/ingestion.js';

/** Nivomi fields a file column can map to (PRD FR-125). */
export const IMPORT_FIELDS = [
  'fullName',
  'firstName',
  'lastName',
  'phone',
  'email',
  'company',
  'jobTitle',
  'sourceLabel',
  'leadStatus',
  'score',
  'city',
  'state',
  'country',
  'preferredLanguage',
  'consentStatus',
  'consentAt',
  'consentReference',
  'preferredCallTime',
  'externalId',
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

/** A column's target: a Nivomi field, a named custom field, or ignored. */
export type MappingTarget = ImportField | `custom:${string}` | 'ignore';

export const REQUIRED_FIELDS: readonly ImportField[] = ['phone'];

export const FIELD_LABELS: Record<ImportField, string> = {
  fullName: 'Full name',
  firstName: 'First name',
  lastName: 'Last name',
  phone: 'Phone',
  email: 'Email',
  company: 'Company',
  jobTitle: 'Job title',
  sourceLabel: 'Source',
  leadStatus: 'Lead status',
  score: 'Lead score',
  city: 'City',
  state: 'State',
  country: 'Country',
  preferredLanguage: 'Preferred language',
  consentStatus: 'Consent status',
  consentAt: 'Inquiry / consent date',
  consentReference: 'Consent reference',
  preferredCallTime: 'Preferred call time',
  externalId: 'External ID',
};

const SYNONYMS: Record<ImportField, readonly string[]> = {
  fullName: ['name', 'full name', 'customer name', 'lead name', 'contact name', 'client name'],
  firstName: ['first name', 'firstname', 'given name', 'fname'],
  lastName: ['last name', 'lastname', 'surname', 'family name', 'lname'],
  phone: [
    'phone',
    'phone number',
    'mobile',
    'mobile number',
    'mobile no',
    'contact number',
    'contact no',
    'mobilephone',
    'cell',
    'cell phone',
    'telephone',
    'whatsapp number',
  ],
  email: ['email', 'email address', 'e mail', 'mail', 'email id'],
  company: ['company', 'company name', 'organisation', 'organization', 'business', 'account'],
  jobTitle: ['job title', 'title', 'designation', 'position', 'role'],
  sourceLabel: ['source', 'lead source', 'channel', 'campaign source'],
  leadStatus: ['lead status', 'status'],
  score: ['lead score', 'score'],
  city: ['city', 'town'],
  state: ['state', 'province', 'region'],
  country: ['country'],
  preferredLanguage: ['language', 'preferred language'],
  consentStatus: ['consent', 'consent status', 'consent basis', 'dnd', 'dnd status', 'opt in'],
  consentAt: [
    'enquiry date',
    'inquiry date',
    'consent date',
    'enquiry time',
    'inquiry time',
    'lead date',
  ],
  consentReference: ['consent reference', 'consent id', 'consent ref'],
  preferredCallTime: ['preferred call time', 'best time to call', 'call time'],
  externalId: ['external id', 'lead id', 'customer id', 'crm id', 'record id', 'id'],
};

const key = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Suggests a mapping from known synonyms; anything unrecognised is left unmapped. */
export function suggestMapping(headers: readonly string[]): Record<string, MappingTarget> {
  const used = new Set<ImportField>();
  const mapping: Record<string, MappingTarget> = {};
  for (const header of headers) {
    const k = key(header);
    const field = IMPORT_FIELDS.find((f) => !used.has(f) && SYNONYMS[f].includes(k));
    if (field) used.add(field);
    mapping[header] = field ?? 'ignore';
  }
  return mapping;
}

/** Problems with a Member's mapping, as user-facing messages. */
export function mappingProblems(
  headers: readonly string[],
  mapping: Readonly<Record<string, string>>,
): string[] {
  const problems: string[] = [];
  const seen = new Map<string, string>();
  for (const [header, target] of Object.entries(mapping)) {
    if (!headers.includes(header)) {
      problems.push(`"${header}" is not a column in this file.`);
      continue;
    }
    if (target === 'ignore') continue;
    if (target.startsWith('custom:')) {
      const name = target.slice('custom:'.length).trim();
      if (!name || name.length > 60) problems.push(`Give the custom field for "${header}" a name.`);
      continue;
    }
    if (!(IMPORT_FIELDS as readonly string[]).includes(target)) {
      problems.push(`"${target}" is not a field you can import into.`);
      continue;
    }
    const previous = seen.get(target);
    if (previous) {
      problems.push(
        `${FIELD_LABELS[target as ImportField]} is mapped twice ("${previous}" and "${header}").`,
      );
    }
    seen.set(target, header);
  }
  for (const field of REQUIRED_FIELDS) {
    if (!seen.has(field)) problems.push(`Map a column to ${FIELD_LABELS[field]}.`);
  }
  const customCount = Object.values(mapping).filter((t) => t.startsWith('custom:')).length;
  if (customCount > 50) problems.push('At most 50 columns can be custom fields.');
  return problems;
}

/** Turns one file row into an ingestion record under a validated mapping. */
export function applyMapping(
  headers: readonly string[],
  cells: readonly string[],
  mapping: Readonly<Record<string, string>>,
): IngestionInput {
  const record: Record<string, string> = {};
  const customFields: Record<string, string> = {};
  headers.forEach((header, index) => {
    const target = mapping[header];
    const value = cells[index] ?? '';
    if (!target || target === 'ignore' || value === '') return;
    if (target.startsWith('custom:')) {
      customFields[target.slice('custom:'.length).trim()] = value;
    } else {
      record[target] = value;
    }
  });
  return { ...record, customFields };
}
