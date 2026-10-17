import { callSessions, callerNumbers, inboundBindings, organizations } from '@nivomi/database';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { INBOUND_SERIES } from '../../src/platform/platform-voice-numbers.service.js';
import { SARVAM_PROVIDER, SarvamProvider } from '../../src/voice/sarvam-provider.js';
import { superAdmin } from '../support/calling.js';
import { createTestApp, owner, type TestApp } from '../support/harness.js';

const EXOPHONE = '+919513886363';
const CALLER = '+918590154802';

async function registerExophone(
  t: TestApp,
  adminClient: Awaited<ReturnType<typeof superAdmin>>['client'],
  organizationId: string,
  phoneE164: string,
): Promise<string> {
  const res = await adminClient
    .post('/api/v1/platform/voice-numbers')
    .send({ phoneE164, organizationId })
    .expect(201);
  return (res.body as { id: string }).id;
}

describe('voice webhooks — Exotel inbound call lands in the real app', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('registered ExoPhone → ExoML greets with the organization name and persists a call_session', async () => {
    const admin = await superAdmin(t);
    const tenant = await owner(t, 'Nivomi Playbook');
    await t.db
      .update(organizations)
      .set({ status: 'ACTIVE' })
      .where(eq(organizations.id, tenant.organizationId));
    await registerExophone(t, admin.client, tenant.organizationId, EXOPHONE);

    const callSid = 'EX-SID-INBOUND-' + Date.now();
    const res = await request(t.server)
      .post('/api/v1/webhooks/exotel/inbound')
      .type('form')
      .send({ CallSid: callSid, From: CALLER, To: EXOPHONE, Direction: 'incoming' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/xml');
    expect(res.text).toContain('<?xml');
    expect(res.text).toContain('<Say voice="female">');
    expect(res.text).toContain('Thank you for calling Nivomi Playbook');
    expect(res.text).toContain('<Hangup/>');

    const [session] = await t.db
      .select()
      .from(callSessions)
      .where(
        and(eq(callSessions.provider, 'exotel'), eq(callSessions.providerCallId, callSid)),
      );
    expect(session).toBeDefined();
    expect(session!.organizationId).toBe(tenant.organizationId);
    expect(session!.direction).toBe('INBOUND');
    expect(session!.fromE164).toBe(CALLER);
    expect(session!.toE164).toBe(EXOPHONE);
    expect(session!.telephonyOutcome).toBeNull();
  });

  it('duplicate inbound webhook with the same CallSid does not create a second row (idempotent)', async () => {
    const admin = await superAdmin(t);
    const tenant = await owner(t, 'Idempotency Co');
    await t.db
      .update(organizations)
      .set({ status: 'ACTIVE' })
      .where(eq(organizations.id, tenant.organizationId));
    const phone = '+919000000011';
    await registerExophone(t, admin.client, tenant.organizationId, phone);

    const callSid = 'EX-SID-DUP-' + Date.now();
    await request(t.server)
      .post('/api/v1/webhooks/exotel/inbound')
      .type('form')
      .send({ CallSid: callSid, From: CALLER, To: phone })
      .expect(200);
    await request(t.server)
      .post('/api/v1/webhooks/exotel/inbound')
      .type('form')
      .send({ CallSid: callSid, From: CALLER, To: phone })
      .expect(200);

    const rows = await t.db
      .select()
      .from(callSessions)
      .where(
        and(eq(callSessions.provider, 'exotel'), eq(callSessions.providerCallId, callSid)),
      );
    expect(rows).toHaveLength(1);
  });

  it('inbound call to an unassigned number returns "not in service" and does not persist a row', async () => {
    const unknownPhone = '+919999999988';
    const callSid = 'EX-SID-UNKNOWN-' + Date.now();
    const res = await request(t.server)
      .post('/api/v1/webhooks/exotel/inbound')
      .type('form')
      .send({ CallSid: callSid, From: CALLER, To: unknownPhone })
      .expect(200);
    expect(res.text).toContain('not in service');
    expect(res.text).toContain('<Hangup/>');

    const rows = await t.db
      .select()
      .from(callSessions)
      .where(
        and(eq(callSessions.provider, 'exotel'), eq(callSessions.providerCallId, callSid)),
      );
    expect(rows).toHaveLength(0);
  });

  it('inbound call to a suspended organization returns an unavailable message and records a reject row', async () => {
    const admin = await superAdmin(t);
    const tenant = await owner(t, 'Suspended Co');
    const phone = '+919000000022';
    await registerExophone(t, admin.client, tenant.organizationId, phone);
    await t.db
      .update(organizations)
      .set({ status: 'SUSPENDED' })
      .where(eq(organizations.id, tenant.organizationId));

    const callSid = 'EX-SID-SUSP-' + Date.now();
    const res = await request(t.server)
      .post('/api/v1/webhooks/exotel/inbound')
      .type('form')
      .send({ CallSid: callSid, From: CALLER, To: phone })
      .expect(200);
    expect(res.text.toLowerCase()).toContain('unavailable');

    const [row] = await t.db
      .select({ telephonyOutcome: callSessions.telephonyOutcome })
      .from(callSessions)
      .where(
        and(eq(callSessions.provider, 'exotel'), eq(callSessions.providerCallId, callSid)),
      );
    expect(row?.telephonyOutcome).toBe('organization_blocked');
  });

  it('status callback updates the matching call_session row with duration and outcome', async () => {
    const admin = await superAdmin(t);
    const tenant = await owner(t, 'Status Co');
    await t.db
      .update(organizations)
      .set({ status: 'ACTIVE' })
      .where(eq(organizations.id, tenant.organizationId));
    const phone = '+919000000033';
    await registerExophone(t, admin.client, tenant.organizationId, phone);

    const callSid = 'EX-SID-STATUS-' + Date.now();
    await request(t.server)
      .post('/api/v1/webhooks/exotel/inbound')
      .type('form')
      .send({ CallSid: callSid, From: CALLER, To: phone })
      .expect(200);

    await request(t.server)
      .post('/api/v1/webhooks/exotel/status')
      .type('form')
      .send({ CallSid: callSid, CallStatus: 'completed', DialCallDuration: '42' })
      .expect(200);

    const [row] = await t.db
      .select()
      .from(callSessions)
      .where(
        and(eq(callSessions.provider, 'exotel'), eq(callSessions.providerCallId, callSid)),
      );
    expect(row?.telephonyOutcome).toBe('completed');
    expect(row?.durationSeconds).toBe(42);
    expect(row?.endedAt).not.toBeNull();
  });

  it('inbound endpoint requires no Nivomi auth and GET also works (Exotel can be configured either way)', async () => {
    const admin = await superAdmin(t);
    const tenant = await owner(t, 'Get Co');
    await t.db
      .update(organizations)
      .set({ status: 'ACTIVE' })
      .where(eq(organizations.id, tenant.organizationId));
    const phone = '+919000000044';
    await registerExophone(t, admin.client, tenant.organizationId, phone);

    const res = await request(t.server)
      .get('/api/v1/webhooks/exotel/inbound')
      .query({ CallSid: 'EX-SID-GET-' + Date.now(), From: CALLER, To: phone });
    expect(res.status).toBe(200);
    expect(res.text).toContain('Thank you for calling Get Co');
  });
});

describe('voice webhooks — turn-based AI conversation (SARVAM_API_KEY set)', () => {
  let t: TestApp;
  let sarvam: SarvamProvider;

  beforeAll(async () => {
    t = await createTestApp({ SARVAM_API_KEY: 'test-key', SARVAM_CHAT_MODEL: 'sarvam-m' });
    sarvam = t.app.get<SarvamProvider>(SARVAM_PROVIDER);
  });

  afterAll(async () => {
    await t.close();
  });

  it('registered ExoPhone → first webhook returns ai_turn with Say + Record', async () => {
    const admin = await superAdmin(t);
    const tenant = await owner(t, 'AI Co');
    await t.db
      .update(organizations)
      .set({ status: 'ACTIVE' })
      .where(eq(organizations.id, tenant.organizationId));
    const phone = '+919000100001';
    await admin.client
      .post('/api/v1/platform/voice-numbers')
      .send({ phoneE164: phone, organizationId: tenant.organizationId })
      .expect(201);

    const callSid = 'EX-AI-OPEN-' + Date.now();
    const res = await request(t.server)
      .post('/api/v1/webhooks/exotel/inbound')
      .type('form')
      .send({ CallSid: callSid, From: CALLER, To: phone })
      .expect(200);

    expect(res.text).toContain('<Say voice="female">');
    expect(res.text).toContain('AI Co');
    expect(res.text).toContain('<Record');
    expect(res.text).toContain('method="POST"');
    expect(res.text).toContain(`callSid=${callSid}`);
    expect(res.text).toContain('turn=1');
    expect(res.text).not.toContain('<Hangup/>');

    const [session] = await t.db
      .select()
      .from(callSessions)
      .where(
        and(eq(callSessions.provider, 'exotel'), eq(callSessions.providerCallId, callSid)),
      );
    expect(session?.organizationId).toBe(tenant.organizationId);
    expect(session?.direction).toBe('INBOUND');
    expect(session?.telephonyOutcome).toBeNull();
  });

  it('turn webhook → fetches recording, runs STT + LLM, persists both roles, returns next Record', async () => {
    const admin = await superAdmin(t);
    const tenant = await owner(t, 'Turn Co');
    await t.db
      .update(organizations)
      .set({ status: 'ACTIVE' })
      .where(eq(organizations.id, tenant.organizationId));
    const phone = '+919000100002';
    await admin.client
      .post('/api/v1/platform/voice-numbers')
      .send({ phoneE164: phone, organizationId: tenant.organizationId })
      .expect(201);

    const callSid = 'EX-AI-TURN-' + Date.now();
    await request(t.server)
      .post('/api/v1/webhooks/exotel/inbound')
      .type('form')
      .send({ CallSid: callSid, From: CALLER, To: phone })
      .expect(200);

    const fakeAudio = Buffer.from('ignored-by-mock');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(fakeAudio, {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      }),
    );
    const sttSpy = vi
      .spyOn(sarvam, 'transcribe')
      .mockResolvedValue({ transcript: 'Hi, what can you tell me about Nivomi?', languageCode: 'en-IN' });
    const chatSpy = vi.spyOn(sarvam, 'chat').mockResolvedValue({
      text: 'Nivomi handles compliant AI calls for Indian businesses. Want a demo?',
      inputTokens: 42,
      outputTokens: 17,
    });

    try {
      const res = await request(t.server)
        .post('/api/v1/webhooks/exotel/inbound/turn')
        .type('form')
        .send({
          CallSid: callSid,
          RecordingUrl: 'https://exotel.example/rec1.mp3',
          RecordingDuration: '3.4',
          turn: '1',
        })
        .expect(200);

      expect(res.headers['content-type']).toContain('application/xml');
      expect(res.text).toContain('Want a demo');
      expect(res.text).toContain('<Record');
      expect(res.text).toContain('turn=2');
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://exotel.example/rec1.mp3',
        expect.objectContaining({}),
      );
      expect(sttSpy).toHaveBeenCalled();
      expect(chatSpy).toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
      sttSpy.mockRestore();
      chatSpy.mockRestore();
    }

    const [session] = await t.db
      .select()
      .from(callSessions)
      .where(
        and(eq(callSessions.provider, 'exotel'), eq(callSessions.providerCallId, callSid)),
      );
    expect(session?.transcript).toHaveLength(2);
    expect(session?.transcript[0]?.role).toBe('caller');
    expect(session?.transcript[0]?.text).toContain('tell me about Nivomi');
    expect(session?.transcript[1]?.role).toBe('agent');
    expect(session?.transcript[1]?.text).toContain('demo');
    expect(session?.usage.inputTokens).toBe(42);
    expect(session?.usage.outputTokens).toBe(17);
    expect(session?.usage.audioSeconds).toBeCloseTo(3.4, 1);
  });

  it('replayed turn webhook does not re-run STT/LLM (idempotent, speaks the stored reply)', async () => {
    const admin = await superAdmin(t);
    const tenant = await owner(t, 'Replay Co');
    await t.db
      .update(organizations)
      .set({ status: 'ACTIVE' })
      .where(eq(organizations.id, tenant.organizationId));
    const phone = '+919000100003';
    await admin.client
      .post('/api/v1/platform/voice-numbers')
      .send({ phoneE164: phone, organizationId: tenant.organizationId })
      .expect(201);

    const callSid = 'EX-AI-REPLAY-' + Date.now();
    await request(t.server)
      .post('/api/v1/webhooks/exotel/inbound')
      .type('form')
      .send({ CallSid: callSid, From: CALLER, To: phone })
      .expect(200);

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(Buffer.from('x'), { status: 200, headers: { 'content-type': 'audio/mpeg' } }),
    );
    const sttSpy = vi.spyOn(sarvam, 'transcribe').mockResolvedValue({
      transcript: 'hello there',
      languageCode: 'en-IN',
    });
    const chatSpy = vi.spyOn(sarvam, 'chat').mockResolvedValue({
      text: 'Hi, how can I help you?',
      inputTokens: 10,
      outputTokens: 6,
    });

    try {
      await request(t.server)
        .post('/api/v1/webhooks/exotel/inbound/turn')
        .type('form')
        .send({ CallSid: callSid, RecordingUrl: 'https://exotel/x.mp3', turn: '1' })
        .expect(200);

      // Replay with the exact same turn index: no new STT/LLM calls, same reply surfaces.
      const res = await request(t.server)
        .post('/api/v1/webhooks/exotel/inbound/turn')
        .type('form')
        .send({ CallSid: callSid, RecordingUrl: 'https://exotel/x.mp3', turn: '1' })
        .expect(200);

      expect(res.text).toContain('how can I help you');
      expect(sttSpy).toHaveBeenCalledTimes(1);
      expect(chatSpy).toHaveBeenCalledTimes(1);
    } finally {
      fetchSpy.mockRestore();
      sttSpy.mockRestore();
      chatSpy.mockRestore();
    }
  });

  it('two consecutive silent recordings end the call with a farewell + Hangup', async () => {
    const admin = await superAdmin(t);
    const tenant = await owner(t, 'Silent Co');
    await t.db
      .update(organizations)
      .set({ status: 'ACTIVE' })
      .where(eq(organizations.id, tenant.organizationId));
    const phone = '+919000100004';
    await admin.client
      .post('/api/v1/platform/voice-numbers')
      .send({ phoneE164: phone, organizationId: tenant.organizationId })
      .expect(201);

    const callSid = 'EX-AI-SILENT-' + Date.now();
    await request(t.server)
      .post('/api/v1/webhooks/exotel/inbound')
      .type('form')
      .send({ CallSid: callSid, From: CALLER, To: phone })
      .expect(200);

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(Buffer.from(''), {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      }),
    );
    const sttSpy = vi
      .spyOn(sarvam, 'transcribe')
      .mockResolvedValue({ transcript: '', languageCode: null });
    const chatSpy = vi.spyOn(sarvam, 'chat');

    try {
      await request(t.server)
        .post('/api/v1/webhooks/exotel/inbound/turn')
        .type('form')
        .send({ CallSid: callSid, RecordingUrl: 'https://x/a.mp3', turn: '1' })
        .expect(200);

      const res = await request(t.server)
        .post('/api/v1/webhooks/exotel/inbound/turn')
        .type('form')
        .send({ CallSid: callSid, RecordingUrl: 'https://x/b.mp3', turn: '2' })
        .expect(200);

      expect(res.text).toContain('<Hangup/>');
      expect(res.text.toLowerCase()).toContain('goodbye');
      expect(chatSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
      sttSpy.mockRestore();
      chatSpy.mockRestore();
    }
  });
});

describe('voice webhooks — human handoff (inbound_bindings.mode = HUMAN)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('inbound call to a number bound to HUMAN mode returns Dial to the handoff number', async () => {
    const admin = await superAdmin(t);
    const tenant = await owner(t, 'Handoff Co');
    await t.db
      .update(organizations)
      .set({ status: 'ACTIVE' })
      .where(eq(organizations.id, tenant.organizationId));
    const phone = '+919000200001';
    const callerNumberId = await registerExophone(t, admin.client, tenant.organizationId, phone);

    await t.db.insert(inboundBindings).values({
      organizationId: tenant.organizationId,
      callerNumberId,
      mode: 'HUMAN',
      handoffE164: '+919876543210',
      agentVersionId: null,
    });

    const callSid = 'EX-HUMAN-' + Date.now();
    const res = await request(t.server)
      .post('/api/v1/webhooks/exotel/inbound')
      .type('form')
      .send({ CallSid: callSid, From: CALLER, To: phone })
      .expect(200);

    expect(res.headers['content-type']).toContain('application/xml');
    expect(res.text).toContain('<Say voice="female">Connecting you to a member of the Handoff Co team.</Say>');
    expect(res.text).toContain('<Dial');
    expect(res.text).toContain('>+919876543210</Dial>');
    expect(res.text).toContain('<Hangup/>');
    expect(res.text).not.toContain('<Record');

    const [session] = await t.db
      .select({ organizationId: callSessions.organizationId, telephonyOutcome: callSessions.telephonyOutcome })
      .from(callSessions)
      .where(
        and(eq(callSessions.provider, 'exotel'), eq(callSessions.providerCallId, callSid)),
      );
    expect(session?.organizationId).toBe(tenant.organizationId);
    expect(session?.telephonyOutcome).toBeNull();
  });

  it('HUMAN mode with empty handoff_e164 fails closed with a misconfigured reject', async () => {
    const admin = await superAdmin(t);
    const tenant = await owner(t, 'Misc Co');
    await t.db
      .update(organizations)
      .set({ status: 'ACTIVE' })
      .where(eq(organizations.id, tenant.organizationId));
    const phone = '+919000200002';
    const callerNumberId = await registerExophone(t, admin.client, tenant.organizationId, phone);

    await t.db.insert(inboundBindings).values({
      organizationId: tenant.organizationId,
      callerNumberId,
      mode: 'HUMAN',
      handoffE164: null,
      agentVersionId: null,
    });

    const callSid = 'EX-HUMAN-MISC-' + Date.now();
    const res = await request(t.server)
      .post('/api/v1/webhooks/exotel/inbound')
      .type('form')
      .send({ CallSid: callSid, From: CALLER, To: phone })
      .expect(200);

    expect(res.text.toLowerCase()).toContain('misconfigured');
    expect(res.text).toContain('<Hangup/>');
    expect(res.text).not.toContain('<Dial');

    const [session] = await t.db
      .select({ telephonyOutcome: callSessions.telephonyOutcome })
      .from(callSessions)
      .where(
        and(eq(callSessions.provider, 'exotel'), eq(callSessions.providerCallId, callSid)),
      );
    expect(session?.telephonyOutcome).toBe('human_misconfigured');
  });
});

describe('platform voice-numbers endpoint — super-admin only, auditable', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('rejects anonymous and tenant users', async () => {
    await request(t.server).get('/api/v1/platform/voice-numbers').expect(401);
    const tenant = await owner(t, 'Tenant Co');
    await tenant.client.get('/api/v1/platform/voice-numbers').expect(403);
    await tenant.client
      .post('/api/v1/platform/voice-numbers')
      .send({ phoneE164: '+919000000055', organizationId: tenant.organizationId })
      .expect(403);
  });

  it('registers a number, lists it with the organization name, and releases it', async () => {
    const admin = await superAdmin(t);
    const tenant = await owner(t, 'Pool Owner Co');
    const phone = '+919000000066';
    const registered = await admin.client
      .post('/api/v1/platform/voice-numbers')
      .send({ phoneE164: phone, organizationId: tenant.organizationId })
      .expect(201);
    const { id } = registered.body as { id: string };

    const listed = await admin.client.get('/api/v1/platform/voice-numbers').expect(200);
    const items = (listed.body as { items: Array<{ id: string; phoneE164: string; organizationName: string; status: string }> }).items;
    const found = items.find((row) => row.id === id);
    expect(found?.phoneE164).toBe(phone);
    expect(found?.organizationName).toBe('Pool Owner Co');
    expect(found?.status).toBe('ACTIVE');

    const [row] = await t.db
      .select({ series: callerNumbers.series, purpose: callerNumbers.purpose })
      .from(callerNumbers)
      .where(eq(callerNumbers.id, id));
    expect(row?.series).toBe(INBOUND_SERIES);
    expect(row?.purpose).toBe('SERVICE');

    await admin.client.delete(`/api/v1/platform/voice-numbers/${id}`).expect(204);
    const [after] = await t.db
      .select({ status: callerNumbers.status })
      .from(callerNumbers)
      .where(eq(callerNumbers.id, id));
    expect(after?.status).toBe('RETIRED');
  });

  it('refuses to register the same number for a different organization', async () => {
    const admin = await superAdmin(t);
    const first = await owner(t, 'First Co');
    const second = await owner(t, 'Second Co');
    const phone = '+919000000077';
    await admin.client
      .post('/api/v1/platform/voice-numbers')
      .send({ phoneE164: phone, organizationId: first.organizationId })
      .expect(201);
    await admin.client
      .post('/api/v1/platform/voice-numbers')
      .send({ phoneE164: phone, organizationId: second.organizationId })
      .expect(409);
  });

  it('refuses an E.164 that is not well-formed', async () => {
    const admin = await superAdmin(t);
    const tenant = await owner(t, 'Validation Co');
    await admin.client
      .post('/api/v1/platform/voice-numbers')
      .send({ phoneE164: '919513886363', organizationId: tenant.organizationId })
      .expect(400);
  });
});
