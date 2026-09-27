import { describe, expect, it } from 'vitest';
import {
  agentDefinitionSchema,
  starterDefinition,
  type AgentDefinition,
} from './agent-definition.js';
import { ConversationEngine, type EngineResult, type Utterance } from './conversation-engine.js';
import { SimulatedLLMProvider } from './llm-provider.js';

/** Budget → timeline → qualified end, with a fallback. */
function qualifyingAgent(overrides: Partial<AgentDefinition> = {}): AgentDefinition {
  return agentDefinitionSchema.parse({
    ...starterDefinition({
      companyName: 'Lotus Realty',
      personaName: 'Asha',
      purpose: 'your flat enquiry',
    }),
    qualification: {
      mode: 'ALL',
      rules: [
        { key: 'budget', op: 'gte', value: 6_000_000 },
        { key: 'months', op: 'lte', value: 6 },
      ],
    },
    workflow: {
      nodes: [
        {
          id: 'start',
          type: 'start',
          position: { x: 0, y: 0 },
          data: { greeting: 'Do you have a minute?' },
        },
        {
          id: 'q1',
          type: 'question',
          position: { x: 0, y: 1 },
          data: { key: 'budget', prompt: 'What is your budget?', answerType: 'number' },
        },
        {
          id: 'q2',
          type: 'question',
          position: { x: 0, y: 2 },
          data: {
            key: 'months',
            prompt: 'When do you plan to buy, in months?',
            answerType: 'number',
          },
        },
        {
          id: 'chat',
          type: 'agent',
          position: { x: 0, y: 3 },
          data: { instructions: 'Answer questions about the project. Keep it short.', maxTurns: 2 },
        },
        {
          id: 'hot',
          type: 'end',
          position: { x: 0, y: 4 },
          data: { outcome: 'INTERESTED', message: 'Great, our advisor will call you.' },
        },
        {
          id: 'cold',
          type: 'end',
          position: { x: 0, y: 5 },
          data: { outcome: 'NOT_INTERESTED', message: 'Thanks for your time.' },
        },
        {
          id: 'later',
          type: 'end',
          position: { x: 0, y: 6 },
          data: { outcome: 'CALLBACK_REQUESTED', message: 'Sure, we will call you later.' },
        },
      ],
      edges: [
        { id: 'e0', source: 'start', target: 'q1', condition: { type: 'always' } },
        { id: 'e1', source: 'q1', target: 'q2', condition: { type: 'always' } },
        {
          id: 'e2',
          source: 'q2',
          target: 'chat',
          condition: { type: 'answer', key: 'months', op: 'lte', value: 6 },
        },
        { id: 'e3', source: 'q2', target: 'cold', condition: { type: 'always' } },
        {
          id: 'e4',
          source: 'chat',
          target: 'later',
          condition: { type: 'intent', intent: 'callback' },
        },
        { id: 'e5', source: 'chat', target: 'hot', condition: { type: 'always' } },
      ],
    },
    ...overrides,
  });
}

async function converse(
  definition: AgentDefinition,
  lines: string[],
  llm = new SimulatedLLMProvider(),
) {
  const engine = new ConversationEngine(definition, llm);
  let result: EngineResult = await engine.start();
  const transcript: Utterance[] = [...result.utterances];
  for (const line of lines) {
    result = await engine.reply(result.state, line, transcript);
    transcript.push({ role: 'caller', text: line }, ...result.utterances);
  }
  return {
    result,
    transcript,
    agentLines: transcript.filter((u) => u.role === 'agent').map((u) => u.text),
  };
}

describe('conversation engine (ADR-022 §4)', () => {
  it('opens with the disclosure and greeting, then asks the first question', async () => {
    const { agentLines, result } = await converse(qualifyingAgent(), []);
    expect(agentLines).toEqual([
      'Hello, this is Asha, an AI assistant calling on behalf of Lotus Realty.',
      "I'm calling about your flat enquiry.",
      'Do you have a minute?',
      'What is your budget?',
    ]);
    expect(result.state).toMatchObject({ nodeId: 'q1', ended: false });
  });

  it('captures typed answers, branches on them and qualifies deterministically', async () => {
    const { result, agentLines } = await converse(qualifyingAgent(), [
      'About 70 lakh',
      '3 months',
      'Is there parking?',
      'Okay thanks',
    ]);
    expect(result.state.answers).toEqual({ budget: 7_000_000, months: 3 });
    expect(
      agentLines.some((l) => /^\(Simulated AI\).*Answer questions about the project\./.test(l)),
    ).toBe(true);
    expect(result.state).toMatchObject({ ended: true, outcome: 'INTERESTED' });
    expect(result.qualification).toBe('QUALIFIED');
  });

  it('follows intent exits from a free-form step', async () => {
    const { result } = await converse(qualifyingAgent(), [
      '80 lakh',
      '2',
      'Can you call me later?',
    ]);
    expect(result.state.outcome).toBe('CALLBACK_REQUESTED');
  });

  it('takes the fallback branch and reports NOT_QUALIFIED', async () => {
    const { result } = await converse(qualifyingAgent(), ['50 lakh', '12 months']);
    expect(result.state).toMatchObject({ ended: true, outcome: 'NOT_INTERESTED' });
    expect(result.qualification).toBe('NOT_QUALIFIED');
  });

  it('re-prompts an unclear answer, then moves on with no answer', async () => {
    const { transcript, result } = await converse(qualifyingAgent(), [
      'hmm',
      'not sure',
      'no idea',
    ]);
    expect(transcript.filter((u) => u.text.startsWith("Sorry, I didn't catch that."))).toHaveLength(
      2,
    );
    expect(result.state.answers.budget).toBeNull();
    expect(result.state.nodeId).toBe('q2');
    expect(result.qualification).toBe('INCOMPLETE');
  });

  it('can hand off after re-prompts when the agent is set to', async () => {
    const agent = qualifyingAgent({
      escalation: { humanRequest: true, afterRepromptsExhausted: true, target: 'the sales desk' },
    });
    const { result, agentLines } = await converse(agent, ['hmm', 'hmm', 'hmm']);
    expect(result.state.outcome).toBe('TRANSFERRED');
    expect(agentLines.at(-1)).toMatch(/the sales desk/);
  });

  it('honours an opt-out or a request for a human at any step, whatever the workflow says', async () => {
    const optOut = await converse(qualifyingAgent(), ['Please stop calling me']);
    expect(optOut.result.state).toMatchObject({ ended: true, outcome: 'OPTED_OUT' });
    const human = await converse(qualifyingAgent(), ['80 lakh', 'I want to talk to a person']);
    expect(human.result.state).toMatchObject({ ended: true, outcome: 'TRANSFERRED' });
  });

  it('refuses turns after the end and reports model token usage', async () => {
    const llm = new SimulatedLLMProvider();
    const engine = new ConversationEngine(qualifyingAgent(), llm);
    const { result } = await converse(qualifyingAgent(), ['stop calling']);
    await expect(engine.reply(result.state, 'hello?', [])).rejects.toThrow(/already ended/);
    const chat = await converse(qualifyingAgent(), ['80 lakh', '2']);
    expect(chat.result.usage.outputTokens).toBeGreaterThan(0);
  });

  it('surfaces a model failure without changing the conversation state', async () => {
    const llm = new SimulatedLLMProvider();
    const engine = new ConversationEngine(qualifyingAgent(), llm);
    const started = await engine.start();
    const afterBudget = await engine.reply(started.state, '80 lakh', []);
    llm.failNext = 1;
    await expect(engine.reply(afterBudget.state, '2 months', [])).rejects.toThrow(
      /Simulated model failure/,
    );
    expect(afterBudget.state.nodeId).toBe('q2');
  });
});
