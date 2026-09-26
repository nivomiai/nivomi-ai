import { describe, expect, it } from 'vitest';
import { applyMapping, mappingProblems, suggestMapping } from './field-mapping.js';

describe('suggestMapping (FR-125)', () => {
  it('maps known synonyms and leaves the rest unmapped', () => {
    expect(
      suggestMapping(['Customer Name', 'Mobile', 'E-mail', 'Enquiry Date', 'Car Model']),
    ).toEqual({
      'Customer Name': 'fullName',
      Mobile: 'phone',
      'E-mail': 'email',
      'Enquiry Date': 'consentAt',
      'Car Model': 'ignore',
    });
  });

  it('never maps two columns to the same field', () => {
    expect(suggestMapping(['Phone', 'Mobile'])).toEqual({ Phone: 'phone', Mobile: 'ignore' });
  });
});

describe('mappingProblems', () => {
  const headers = ['Name', 'Phone', 'Model'];

  it('accepts a complete mapping with custom fields', () => {
    expect(
      mappingProblems(headers, { Name: 'fullName', Phone: 'phone', Model: 'custom:Car model' }),
    ).toEqual([]);
  });

  it('requires a phone column and rejects duplicates and unknown targets', () => {
    expect(mappingProblems(headers, { Name: 'fullName' })).toContain('Map a column to Phone.');
    expect(mappingProblems(headers, { Name: 'phone', Phone: 'phone' })[0]).toMatch(/mapped twice/);
    expect(mappingProblems(headers, { Phone: 'phone', Name: 'password' })[0]).toMatch(
      /not a field/,
    );
    expect(mappingProblems(headers, { Phone: 'phone', Other: 'email' })[0]).toMatch(/not a column/);
  });
});

describe('applyMapping', () => {
  it('builds an ingestion record and skips empty cells', () => {
    expect(
      applyMapping(['Name', 'Phone', 'Model', 'Notes'], ['Asha', '9876543210', 'SUV', ''], {
        Name: 'fullName',
        Phone: 'phone',
        Model: 'custom:Model',
        Notes: 'ignore',
      }),
    ).toEqual({ fullName: 'Asha', phone: '9876543210', customFields: { Model: 'SUV' } });
  });
});
