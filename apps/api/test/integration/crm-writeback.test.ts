import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CrmWritebackService } from '../../src/crm/writeback.service.js';
import { callingOrg, superAdmin } from '../support/calling.js';
import { createTestApp, type Browser, type TestApp } from '../support/harness.js';

describe('CRM write-back outbox (ADR-026, Phase 7)', () => {
  let t: TestApp;
  let admin: Browser;

  beforeAll(async () => {
    t = await createTestApp({ VOICE_SIMULATED_CALL_MS: '0' });
    admin = (await superAdmin(t)).client;
  });

  afterAll(async () => {
    await t.close();
  });

  it('enqueues a lead-status projection; replay with the same payload returns the same row', async () => {
    const org = await callingOrg(t, admin, 'CRM Writeback Co');
    const svc = t.app.get(CrmWritebackService);
    const leadId = crypto.randomUUID();
    const first = await svc.enqueue(org.organizationId, {
      kind: 'PUSH_LEAD_STATUS',
      entityId: leadId,
      payload: { leadId, contactCrmId: 'hs-contact-1', status: 'QUALIFIED' },
    });
    const replay = await svc.enqueue(org.organizationId, {
      kind: 'PUSH_LEAD_STATUS',
      entityId: leadId,
      payload: { leadId, contactCrmId: 'hs-contact-1', status: 'QUALIFIED' },
    });
    expect(first.created).toBe(true);
    expect(replay.created).toBe(false);
    expect(first.id).toBe(replay.id);
  });

  it('a changed projection enqueues a new row (not idempotent across payload changes)', async () => {
    const org = await callingOrg(t, admin, 'CRM Writeback Change Co');
    const svc = t.app.get(CrmWritebackService);
    const leadId = crypto.randomUUID();
    const first = await svc.enqueue(org.organizationId, {
      kind: 'PUSH_LEAD_STATUS',
      entityId: leadId,
      payload: { leadId, contactCrmId: 'hs-contact-1', status: 'CONTACTED' },
    });
    const second = await svc.enqueue(org.organizationId, {
      kind: 'PUSH_LEAD_STATUS',
      entityId: leadId,
      payload: { leadId, contactCrmId: 'hs-contact-1', status: 'QUALIFIED' },
    });
    expect(first.id).not.toBe(second.id);
    const pending = await svc.pending(org.organizationId);
    expect(pending).toHaveLength(2);
  });
});
