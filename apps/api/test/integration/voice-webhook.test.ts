import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApp, type TestApp } from '../support/harness.js';

describe('voice webhooks — Exotel Flow Passthru responds with ExoML', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('GET /api/v1/webhooks/exotel/inbound returns valid ExoML with the Nivomi greeting', async () => {
    const res = await request(t.server)
      .get('/api/v1/webhooks/exotel/inbound')
      .query({
        CallSid: 'test-call-sid',
        CallFrom: '+918590154802',
        CallTo: '+919513886363',
        Direction: 'incoming',
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/xml');
    expect(res.text).toContain('<?xml');
    expect(res.text).toContain('<Response>');
    expect(res.text).toContain('<Say');
    expect(res.text).toContain('Hi, I am Nivomi. Your test is successful.');
    expect(res.text).toContain('<Hangup/>');
  });

  it('POST /api/v1/webhooks/exotel/inbound accepts form-encoded body (Exotel default)', async () => {
    const res = await request(t.server)
      .post('/api/v1/webhooks/exotel/inbound')
      .type('form')
      .send({
        CallSid: 'test-call-sid-form',
        From: '+918590154802',
        To: '+919513886363',
      });

    expect(res.status).toBe(200);
    expect(res.text).toContain('Hi, I am Nivomi. Your test is successful.');
  });

  it('POST /api/v1/webhooks/exotel/status returns 200 and does not require authentication', async () => {
    const res = await request(t.server)
      .post('/api/v1/webhooks/exotel/status')
      .type('form')
      .send({
        CallSid: 'test-call-sid',
        CallStatus: 'completed',
        DialCallDuration: '42',
      });

    expect(res.status).toBe(200);
    expect(res.text).toBe('OK');
  });

  it('inbound endpoint requires no authentication (Exotel cannot carry Nivomi JWT)', async () => {
    const res = await request(t.server).get('/api/v1/webhooks/exotel/inbound');
    expect(res.status).toBe(200);
  });
});
