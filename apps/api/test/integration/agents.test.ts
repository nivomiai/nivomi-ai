import { agentVersions, callAttempts } from '@nivomi/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LLM_PROVIDER, SimulatedLLMProvider } from '../../src/agents/llm-provider.js';
import {
  addLead,
  callingOrg,
  controlClock,
  createCampaign,
  prelaunch,
  runJobs,
  superAdmin,
  voiceOf,
} from '../support/calling.js';
import { createTestApp, joinAs, owner, type Browser, type TestApp } from '../support/harness.js';

interface AgentBody {
  id: string;
  status: string;
  latestVersion: number;
  problems: string[];
  unpublishedChanges: boolean;
  versions: { id: string; version: number }[];
  definition: {
    personaName: string;
    workflow: { nodes: { id: string; type: string }[]; edges: { id: string }[] };
  };
}

interface SessionBody {
  id: string;
  turn: number;
  ended: boolean;
  outcome: string | null;
  currentStep: string;
  answers: Record<string, unknown>;
  qualification: string;
  transcript: { role: string; text: string }[];
}

describe('AI agents, versions and test chat (FR-26–FR-32, ADR-022)', () => {
  let t: TestApp;
  let admin: Browser;

  beforeAll(async () => {
    t = await createTestApp({ VOICE_SIMULATED_CALL_MS: '0' });
    controlClock(t);
    admin = (await superAdmin(t)).client;
  });

  afterAll(async () => {
    await t.close();
  });

  const createAgent = async (client: Browser, callCategory = 'PROMOTIONAL') =>
    (
      (await client.post('/api/v1/agents').send({ name: 'Sales agent', callCategory }).expect(201))
        .body as { id: string }
    ).id;
  const getAgent = async (client: Browser, id: string) =>
    (await client.get(`/api/v1/agents/${id}`).expect(200)).body as AgentBody;

  it('creates a valid starter agent named after the organization, and scopes access by role', async () => {
    const o = await owner(t, 'Harbour Homes');
    const manager = await joinAs(t, o.client, 'MANAGER');
    const analyst = await joinAs(t, o.client, 'ANALYST');
    const agent = await joinAs(t, o.client, 'AGENT');

    const id = await createAgent(manager.client);
    const body = await getAgent(analyst.client, id);
    expect(body).toMatchObject({
      status: 'DRAFT',
      latestVersion: 0,
      problems: [],
      unpublishedChanges: true,
    });
    expect(JSON.stringify(body.definition)).toContain('Harbour Homes');

    await analyst.client
      .post('/api/v1/agents')
      .send({ name: 'x', callCategory: 'SERVICE' })
      .expect(403);
    await analyst.client.post(`/api/v1/agents/${id}/publish`).expect(403);
    await agent.client.get('/api/v1/agents').expect(403);
    const tools = await analyst.client.get('/api/v1/agents/tools').expect(200);
    expect((tools.body as { items: { name: string }[] }).items.map((i) => i.name)).toContain(
      'handoff.request',
    );
  });

  it('saves unfinished drafts with their problems, but only publishes valid workflows', async () => {
    const o = await owner(t, 'Draft Co');
    const id = await createAgent(o.client);
    const draft = await getAgent(o.client, id);

    const malformed = await o.client
      .put(`/api/v1/agents/${id}`)
      .send({ definition: { ...draft.definition, knowledge: 'x'.repeat(20_001) } })
      .expect(400);
    expect(JSON.stringify(malformed.body)).toContain('knowledge');

    // Dropping the fallback edge leaves a step that can get stuck.
    const broken = {
      ...draft.definition,
      workflow: {
        ...draft.definition.workflow,
        edges: draft.definition.workflow.edges.filter((e) => e.id !== 'e3'),
      },
    };
    const saved = await o.client
      .put(`/api/v1/agents/${id}`)
      .send({ definition: broken })
      .expect(200);
    expect((saved.body as AgentBody).problems.join(' ')).toMatch(/otherwise/);
    const refused = await o.client.post(`/api/v1/agents/${id}/publish`).expect(400);
    expect(JSON.stringify(refused.body)).toMatch(/otherwise/);
  });

  it('publishes immutable, numbered versions (FR-32)', async () => {
    const o = await owner(t, 'Versions Co');
    const id = await createAgent(o.client);
    const v1 = await o.client.post(`/api/v1/agents/${id}/publish`).expect(201);
    expect(v1.body).toMatchObject({ version: 1 });
    await o.client.post(`/api/v1/agents/${id}/publish`).expect(409); // nothing changed

    const draft = await getAgent(o.client, id);
    await o.client
      .put(`/api/v1/agents/${id}`)
      .send({ definition: { ...draft.definition, personaName: 'Ravi' } })
      .expect(200);
    expect((await getAgent(o.client, id)).unpublishedChanges).toBe(true);
    await o.client.post(`/api/v1/agents/${id}/publish`).expect(201);

    const body = await getAgent(o.client, id);
    expect(body).toMatchObject({ status: 'ACTIVE', latestVersion: 2, unpublishedChanges: false });
    expect(body.versions.map((v) => v.version)).toEqual([2, 1]);
    const first = await o.client
      .get(`/api/v1/agents/${id}/versions/${(v1.body as { id: string }).id}`)
      .expect(200);
    expect(first.body).toMatchObject({ version: 1, definition: { personaName: 'Maya' } });

    await expect(
      t.db
        .update(agentVersions)
        .set({ checksum: 'edited' })
        .where(eq(agentVersions.id, (v1.body as { id: string }).id)),
    ).rejects.toThrow();
  });

  it('pins campaigns to a version of the same call type and records it on every call', async () => {
    const o = await callingOrg(t, admin, 'Pinned Co');
    const lead = await addLead(o.client, {
      fullName: 'Pinned Lead',
      consentBasis: 'EXISTING_CUSTOMER',
    });

    // A service agent cannot run a promotional campaign.
    const serviceAgent = await createAgent(o.client, 'SERVICE');
    const service = await o.client.post(`/api/v1/agents/${serviceAgent}/publish`).expect(201);
    const mismatch = await o.client
      .post('/api/v1/campaigns')
      .send({
        name: 'Mismatch',
        callCategory: 'PROMOTIONAL',
        callerNumberId: o.callerNumberId,
        agentVersionId: (service.body as { id: string }).id,
        selection: { kind: 'FILTER' },
        budgetMinutes: 10,
      })
      .expect(400);
    expect(JSON.stringify(mismatch.body)).toMatch(/must match/);

    // No agent: it cannot launch.
    const unpinned = await createCampaign({ ...o, agentVersionId: null as unknown as string });
    await prelaunch(t, o.client, unpinned);
    const refused = await o.client.post(`/api/v1/campaigns/${unpinned}/launch`).expect(409);
    expect(JSON.stringify(refused.body)).toMatch(/AI agent/);

    const pinned = await createCampaign(o);
    await prelaunch(t, o.client, pinned);
    await o.client.post(`/api/v1/campaigns/${pinned}/launch`).expect(204);
    await runJobs(t, 3);
    const [attempt] = await t.db
      .select()
      .from(callAttempts)
      .where(eq(callAttempts.campaignId, pinned));
    expect(attempt?.agentVersionId).toBe(o.agentVersionId);
    expect(voiceOf(t).placed.find((p) => p.to === lead.phone)?.agentVersionId).toBe(
      o.agentVersionId,
    );
    const detail = await o.client.get(`/api/v1/campaigns/${pinned}`).expect(200);
    expect(detail.body).toMatchObject({ agentVersion: { id: o.agentVersionId, version: 1 } });
  });

  describe('test chat', () => {
    it('runs the workflow turn by turn, idempotently, and ends on an opt-out', async () => {
      const o = await owner(t, 'Chat Co');
      const id = await createAgent(o.client);
      const started = await o.client
        .post(`/api/v1/agents/${id}/test-sessions`)
        .send({})
        .expect(201);
      const session = started.body as SessionBody;
      expect(session.transcript.map((u) => u.text)).toEqual([
        'Hello, this is Maya, an AI assistant calling on behalf of Chat Co.',
        "I'm calling about your recent enquiry.",
        'Is this a good time to talk for two minutes?',
        'Would you like to hear more about it?',
      ]);

      const turn = (n: number, text: string) =>
        o.client
          .post(`/api/v1/agents/${id}/test-sessions/${session.id}/turns`)
          .send({ turn: n, text });
      const first = (await turn(1, 'Yes please').expect(200)).body as SessionBody;
      expect(first).toMatchObject({ turn: 1, currentStep: 'pitch', answers: { interested: true } });
      expect(first.transcript.at(-1)?.text).toMatch(/^\(Simulated AI\)/);

      // A retried request for turn 1 does not advance the conversation.
      const replay = (await turn(1, 'Yes please').expect(200)).body as SessionBody;
      expect(replay.transcript).toHaveLength(first.transcript.length);
      await turn(3, 'skipping ahead').expect(409);

      const ended = (await turn(2, "Please don't call me again").expect(200)).body as SessionBody;
      expect(ended).toMatchObject({ ended: true, outcome: 'OPTED_OUT' });
      await turn(3, 'hello?').expect(409);
    });

    it('reports a model failure without losing the turn', async () => {
      const o = await owner(t, 'Flaky Model Co');
      const id = await createAgent(o.client);
      const session = (
        await o.client.post(`/api/v1/agents/${id}/test-sessions`).send({}).expect(201)
      ).body as SessionBody;
      const llm = t.app.get<SimulatedLLMProvider>(LLM_PROVIDER);
      llm.failNext = 1;
      const failed = await o.client
        .post(`/api/v1/agents/${id}/test-sessions/${session.id}/turns`)
        .send({ turn: 1, text: 'yes' })
        .expect(502);
      expect(failed.body).toMatchObject({ error: { code: 'PROVIDER_ERROR', retryable: true } });
      const retried = await o.client
        .post(`/api/v1/agents/${id}/test-sessions/${session.id}/turns`)
        .send({ turn: 1, text: 'yes' })
        .expect(200);
      expect((retried.body as SessionBody).turn).toBe(1);
    });
  });

  it('never exposes another organization’s agents, versions or test chats', async () => {
    const a = await owner(t, 'Agent Tenant A');
    const b = await callingOrg(t, admin, 'Agent Tenant B');
    const id = await createAgent(a.client);
    const version = (await a.client.post(`/api/v1/agents/${id}/publish`).expect(201)).body as {
      id: string;
    };
    const session = (await a.client.post(`/api/v1/agents/${id}/test-sessions`).send({}).expect(201))
      .body as SessionBody;

    await b.client.get(`/api/v1/agents/${id}`).expect(404);
    await b.client.put(`/api/v1/agents/${id}`).send({ name: 'stolen' }).expect(404);
    await b.client.post(`/api/v1/agents/${id}/publish`).expect(404);
    await b.client.get(`/api/v1/agents/${id}/versions/${version.id}`).expect(404);
    await b.client.get(`/api/v1/agents/${id}/test-sessions/${session.id}`).expect(404);
    await b.client
      .post(`/api/v1/agents/${id}/test-sessions/${session.id}/turns`)
      .send({ turn: 1, text: 'yes' })
      .expect(404);
    const list = await b.client.get('/api/v1/agents').expect(200);
    expect((list.body as { items: { id: string }[] }).items.map((i) => i.id)).not.toContain(id);
    // B cannot pin A's version to its campaign.
    await b.client
      .post('/api/v1/campaigns')
      .send({
        name: 'Borrowed agent',
        callCategory: 'PROMOTIONAL',
        callerNumberId: b.callerNumberId,
        agentVersionId: version.id,
        selection: { kind: 'FILTER' },
        budgetMinutes: 10,
      })
      .expect(400);
  });
});
