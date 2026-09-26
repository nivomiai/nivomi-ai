import { describe, expect, it, vi } from 'vitest';
import {
  LeadHandoffError,
  type LeadInput,
  buildLeadMessage,
  createContactChannelClient,
  firstInvalidField,
  leadEmailSubject,
  mailtoUrl,
  validateLead,
  whatsappUrl,
} from './lead-capture';

const valid: LeadInput = {
  intent: 'demo',
  name: 'Priya Nair',
  email: 'priya@example.in',
  company: 'Kochi Homes',
  phone: '+91 98765 43210',
  leadVolume: '500-2000',
  message: 'Site-visit follow-up',
};

describe('validateLead', () => {
  it('accepts a complete lead', () => {
    expect(validateLead(valid)).toEqual({});
  });

  it('flags missing name, invalid email and invalid phone', () => {
    const errors = validateLead({ ...valid, name: ' ', email: 'priya@', phone: '12ab' });
    expect(Object.keys(errors).sort()).toEqual(['email', 'name', 'phone']);
    expect(firstInvalidField(errors)).toBe('name');
  });

  it('requires company and rejects unknown lead volumes and over-long messages', () => {
    const errors = validateLead({
      ...valid,
      company: '',
      leadVolume: 'lots',
      message: 'x'.repeat(1001),
    });
    expect(errors.company).toBeDefined();
    expect(errors.leadVolume).toBeDefined();
    expect(errors.message).toBeDefined();
  });

  it('accepts phones with 8 to 15 digits and common separators only', () => {
    expect(validateLead({ ...valid, phone: '(0484) 123-4567' }).phone).toBeUndefined();
    expect(validateLead({ ...valid, phone: '1234567' }).phone).toBeDefined();
    expect(validateLead({ ...valid, phone: '+1234567890123456' }).phone).toBeDefined();
  });

  it('treats lead volume as optional', () => {
    expect(validateLead({ ...valid, leadVolume: '' })).toEqual({});
  });
});

describe('buildLeadMessage', () => {
  it('includes the intent, contact fields and optional details', () => {
    const text = buildLeadMessage({
      ...valid,
      interest: 'WhatsApp AI Manager',
      intent: 'coming-soon',
    });
    expect(text.split('\n')).toEqual([
      'Hi Nivomi AI — Interested in an upcoming product.',
      'Product: WhatsApp AI Manager',
      'Name: Priya Nair',
      'Work email: priya@example.in',
      'Company: Kochi Homes',
      'Phone: +91 98765 43210',
      'Lead volume: 500 – 2,000 leads a month',
      'Message: Site-visit follow-up',
    ]);
  });

  it('omits empty optional lines', () => {
    const text = buildLeadMessage({ ...valid, leadVolume: '', message: '  ' });
    expect(text).not.toMatch(/Lead volume|Message/);
  });
});

describe('channel URLs', () => {
  it('encodes WhatsApp and mailto payloads', () => {
    expect(whatsappUrl('919946202458', 'a b&c')).toBe('https://wa.me/919946202458?text=a%20b%26c');
    expect(mailtoUrl('x@y.in', 'Hi there', 'l1\nl2')).toBe(
      'mailto:x@y.in?subject=Hi%20there&body=l1%0Al2',
    );
    expect(leadEmailSubject(valid)).toBe('Book a demo — Nivomi AI');
  });
});

describe('createContactChannelClient', () => {
  it('opens WhatsApp with the prefilled enquiry', async () => {
    const openWindow = vi.fn((_url: string): unknown => ({}));
    const client = createContactChannelClient({ whatsappNumber: '919946202458', openWindow });
    await expect(client.submit(valid)).resolves.toEqual({ channel: 'whatsapp' });
    const url = openWindow.mock.calls[0]?.[0];
    expect(url).toContain('https://wa.me/919946202458?text=');
    expect(decodeURIComponent(url?.split('text=')[1] ?? '')).toContain('Company: Kochi Homes');
  });

  it('rejects with a blocked handoff when the tab could not open', async () => {
    const client = createContactChannelClient({ whatsappNumber: '1', openWindow: () => null });
    await expect(client.submit(valid)).rejects.toEqual(new LeadHandoffError('blocked'));
  });

  it('rejects with a failed handoff when opening throws', async () => {
    const client = createContactChannelClient({
      whatsappNumber: '1',
      openWindow: () => {
        throw new Error('boom');
      },
    });
    const error = await client.submit(valid).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LeadHandoffError);
    expect((error as LeadHandoffError).reason).toBe('failed');
    expect((error as Error).message).not.toContain('boom');
  });
});
