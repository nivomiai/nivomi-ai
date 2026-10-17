import { auditLogs, userWelcomeSurveys } from '@nivomi/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { browser, createTestApp, owner, signedInUser, type TestApp } from '../support/harness.js';

const ANSWERS = {
  role: 'business_owner',
  callVolume: '1k_10k',
  migratingFrom: 'new',
  referralSource: 'search',
};

describe('welcome survey', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  const pending = async (client: ReturnType<typeof browser>) =>
    ((await client.get('/api/v1/me').expect(200)).body as { welcomeSurveyPending: boolean })
      .welcomeSurveyPending;

  it('is pending for a new account and done once answered', async () => {
    const { client, organizationId } = await owner(t, 'Survey Co');
    expect(await pending(client)).toBe(true);

    await client.put('/api/v1/me/welcome-survey').send(ANSWERS).expect(204);
    expect(await pending(client)).toBe(false);

    const me = (await client.get('/api/v1/me').expect(200)).body as { user: { id: string } };
    const [row] = await t.db
      .select()
      .from(userWelcomeSurveys)
      .where(eq(userWelcomeSurveys.userId, me.user.id));
    expect(row).toMatchObject(ANSWERS);

    const audits = await t.db.select().from(auditLogs).where(eq(auditLogs.actorUserId, me.user.id));
    const completed = audits.filter((a) => a.action === 'user.welcome_survey_completed');
    expect(completed).toHaveLength(1);
    expect(completed[0]?.organizationId).toBe(organizationId);
  });

  it('is idempotent: answering again updates the answers and audits only once', async () => {
    const { client } = await signedInUser(t, 'repeat');
    await client.put('/api/v1/me/welcome-survey').send(ANSWERS).expect(204);
    await client
      .put('/api/v1/me/welcome-survey')
      .send({ ...ANSWERS, referralSource: 'social' })
      .expect(204);

    const me = (await client.get('/api/v1/me').expect(200)).body as { user: { id: string } };
    const [row] = await t.db
      .select()
      .from(userWelcomeSurveys)
      .where(eq(userWelcomeSurveys.userId, me.user.id));
    expect(row?.referralSource).toBe('social');
    const audits = await t.db.select().from(auditLogs).where(eq(auditLogs.actorUserId, me.user.id));
    expect(audits.filter((a) => a.action === 'user.welcome_survey_completed')).toHaveLength(1);
  });

  it("only touches the caller's own answers", async () => {
    const first = await signedInUser(t, 'first');
    const second = await signedInUser(t, 'second');
    await first.client.put('/api/v1/me/welcome-survey').send(ANSWERS).expect(204);
    expect(await pending(first.client)).toBe(false);
    expect(await pending(second.client)).toBe(true);
  });

  it('rejects missing or unknown answers', async () => {
    const { client } = await signedInUser(t, 'invalid');
    await client
      .put('/api/v1/me/welcome-survey')
      .send({ ...ANSWERS, role: 'astronaut' })
      .expect(400);
    await client.put('/api/v1/me/welcome-survey').send({ role: 'other' }).expect(400);
    expect(await pending(client)).toBe(true);
  });

  it('requires a signed-in user', async () => {
    await browser(t).put('/api/v1/me/welcome-survey').send(ANSWERS).expect(401);
  });
});
