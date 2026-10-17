import type {
  AgentDefinition,
  EdgeCondition,
  WorkflowEdge,
  WorkflowNode,
} from './agent-definition.js';
import {
  compare,
  detectIntents,
  parseAnswer,
  qualify,
  type AnswerValue,
  type Intent,
  type QualificationResult,
} from './answers.js';
import type { LLMProvider, LlmMessage } from './llm-provider.js';
import {
  LIMIT_REPLY,
  OPT_OUT_REPLY,
  compileSystemPrompt,
  handoffReply,
  openingLines,
} from './prompt-compiler.js';

/**
 * The conversation engine (ADR-022 §4): walks an agent's workflow turn by turn. Deterministic
 * except for the words of free-form `agent` steps, which come from the LLMProvider. Test chat
 * uses it now; live calls use it in Phase 4b.
 */

export type ConversationOutcome =
  | 'INTERESTED'
  | 'NOT_INTERESTED'
  | 'CALLBACK_REQUESTED'
  | 'COMPLETED'
  | 'OPTED_OUT'
  | 'TRANSFERRED'
  | 'INCOMPLETE';

export interface ConversationState {
  readonly nodeId: string;
  readonly answers: Record<string, AnswerValue>;
  /** Caller turns so far. */
  readonly turns: number;
  /** Caller turns spent in the current step. */
  readonly nodeTurns: number;
  readonly reprompts: number;
  readonly ended: boolean;
  readonly outcome: ConversationOutcome | null;
}

export interface Utterance {
  readonly role: 'agent' | 'caller';
  readonly text: string;
  readonly nodeId?: string | undefined;
}

export interface EngineResult {
  readonly state: ConversationState;
  /** New utterances from this step (the caller's own turn is not repeated). */
  readonly utterances: Utterance[];
  readonly qualification: QualificationResult;
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number };
}

export const MAX_TURNS = 60;
const MAX_HOPS = 20;

export class ConversationEngine {
  private readonly nodes: Map<string, WorkflowNode>;
  private readonly edges: Map<string, WorkflowEdge[]>;

  constructor(
    private readonly definition: AgentDefinition,
    private readonly llm: LLMProvider,
  ) {
    this.nodes = new Map(definition.workflow.nodes.map((n) => [n.id, n]));
    this.edges = new Map();
    for (const edge of definition.workflow.edges) {
      this.edges.set(edge.source, [...(this.edges.get(edge.source) ?? []), edge]);
    }
  }

  /** Opens the conversation: mandatory opening, greeting, then the first step. */
  async start(): Promise<EngineResult> {
    const start = this.definition.workflow.nodes.find((n) => n.type === 'start');
    if (!start) throw new Error('workflow has no start step');
    const run = new Run(this, {
      nodeId: start.id,
      answers: {},
      turns: 0,
      nodeTurns: 0,
      reprompts: 0,
      ended: false,
      outcome: null,
    });
    for (const line of openingLines(this.definition)) run.say(line, start.id);
    await run.advance(start, new Set(), []);
    return run.result();
  }

  /** Handles one caller turn. `history` is the transcript so far (for free-form steps). */
  async reply(
    state: ConversationState,
    text: string,
    history: readonly Utterance[],
  ): Promise<EngineResult> {
    if (state.ended) throw new Error('conversation already ended');
    const run = new Run(this, { ...state, turns: state.turns + 1 });
    const intents = detectIntents(text);
    const transcript = [...history, { role: 'caller' as const, text }];

    // Platform intents first: no workflow can override an opt-out or a request for a human.
    if (intents.has('opt_out')) return run.end('OPTED_OUT', OPT_OUT_REPLY).result();
    if (intents.has('human')) return run.end('TRANSFERRED', handoffReply(this.definition)).result();
    if (run.state.turns > MAX_TURNS) return run.end('INCOMPLETE', LIMIT_REPLY).result();

    const node = this.node(state.nodeId);
    if (node.type === 'question') {
      const parsed = parseAnswer(node.data.answerType, text, node.data.options);
      if (!parsed.ok) {
        if (run.state.reprompts < this.definition.callLimits.maxReprompts) {
          run.patch({ reprompts: run.state.reprompts + 1 });
          run.say(reprompt(node), node.id);
          return run.result();
        }
        if (this.definition.escalation.afterRepromptsExhausted) {
          return run.end('TRANSFERRED', handoffReply(this.definition)).result();
        }
        run.patch({ answers: { ...run.state.answers, [node.data.key]: null } });
      } else {
        run.patch({ answers: { ...run.state.answers, [node.data.key]: parsed.value } });
      }
      await run.advance(node, intents, transcript);
      return run.result();
    }

    if (node.type === 'agent') {
      const nodeTurns = run.state.nodeTurns + 1;
      run.patch({ nodeTurns });
      const conditional = this.exits(node).find(
        (e) =>
          e.condition.type !== 'always' && this.matches(e.condition, run.state.answers, intents),
      );
      if (conditional) {
        await run.enter(this.node(conditional.target), transcript);
        return run.result();
      }
      if (nodeTurns >= node.data.maxTurns) {
        await run.advance(node, intents, transcript);
        return run.result();
      }
      await run.speak(node, transcript);
      return run.result();
    }

    // A start or terminal step is never waiting for input; move on defensively.
    await run.advance(node, intents, transcript);
    return run.result();
  }

  /** FR-28 result for a state, from rules only. */
  qualification(state: ConversationState): QualificationResult {
    return qualify(this.definition.qualification, state.answers);
  }

  node(id: string): WorkflowNode {
    const node = this.nodes.get(id);
    if (!node) throw new Error(`workflow step ${id} not found`);
    return node;
  }

  exits(node: WorkflowNode): WorkflowEdge[] {
    return this.edges.get(node.id) ?? [];
  }

  matches(
    condition: EdgeCondition,
    answers: Readonly<Record<string, AnswerValue>>,
    intents: ReadonlySet<Intent>,
  ): boolean {
    switch (condition.type) {
      case 'always':
        return true;
      case 'intent':
        return intents.has(condition.intent);
      case 'answer':
        return compare(answers[condition.key], condition.op, condition.value);
    }
  }

  get agent(): AgentDefinition {
    return this.definition;
  }

  get model(): LLMProvider {
    return this.llm;
  }
}

function reprompt(node: Extract<WorkflowNode, { type: 'question' }>): string {
  const hint =
    node.data.answerType === 'yes_no'
      ? ' Please answer yes or no.'
      : node.data.answerType === 'single_choice'
        ? ` You can say ${node.data.options.join(', ')}.`
        : node.data.answerType === 'number'
          ? ' A number is fine.'
          : node.data.answerType === 'date'
            ? ' Please give a date, like 25/10/2026.'
            : '';
  return `Sorry, I didn't catch that. ${node.data.prompt}${hint}`;
}

/** Mutable working copy of one engine step. */
class Run {
  state: ConversationState;
  private readonly out: Utterance[] = [];
  private inputTokens = 0;
  private outputTokens = 0;

  constructor(
    private readonly engine: ConversationEngine,
    state: ConversationState,
  ) {
    this.state = state;
  }

  patch(changes: Partial<ConversationState>): void {
    this.state = { ...this.state, ...changes };
  }

  say(text: string, nodeId?: string): void {
    this.out.push({ role: 'agent', text, nodeId });
  }

  end(outcome: ConversationOutcome, message: string): this {
    this.say(message, this.state.nodeId);
    this.patch({ ended: true, outcome });
    return this;
  }

  /** Follows the first matching exit of `from` (a fallback always exists in valid workflows). */
  async advance(
    from: WorkflowNode,
    intents: ReadonlySet<Intent>,
    transcript: readonly Utterance[],
  ) {
    const edge = this.engine
      .exits(from)
      .find((e) => this.engine.matches(e.condition, this.state.answers, intents));
    if (!edge) {
      this.end('INCOMPLETE', LIMIT_REPLY);
      return;
    }
    await this.enter(this.engine.node(edge.target), transcript);
  }

  /** Enters a step, following automatic transitions until something waits for the caller. */
  async enter(node: WorkflowNode, transcript: readonly Utterance[]): Promise<void> {
    let current: WorkflowNode = node;
    for (let hop = 0; hop < MAX_HOPS; hop += 1) {
      this.patch({ nodeId: current.id, nodeTurns: 0, reprompts: 0 });
      switch (current.type) {
        case 'question':
          this.say(current.data.prompt, current.id);
          return;
        case 'agent':
          await this.speak(current, transcript);
          return;
        case 'handoff':
          this.say(current.data.message, current.id);
          this.patch({ ended: true, outcome: 'TRANSFERRED' });
          return;
        case 'end':
          this.say(current.data.message, current.id);
          this.patch({ ended: true, outcome: current.data.outcome });
          return;
        case 'start': {
          const next = this.engine.exits(current)[0];
          if (!next) break;
          current = this.engine.node(next.target);
          continue;
        }
      }
      break;
    }
    this.end('INCOMPLETE', LIMIT_REPLY);
  }

  /** One free-form turn from the model, with the compiled (guarded) system prompt. */
  async speak(node: WorkflowNode, transcript: readonly Utterance[]): Promise<void> {
    const messages: LlmMessage[] = [...transcript, ...this.out].slice(-20).map((u) => ({
      role: u.role === 'agent' ? 'assistant' : 'user',
      content: u.text,
    }));
    const response = await this.engine.model.complete({
      system: compileSystemPrompt(this.engine.agent, node),
      messages,
      maxTokens: 200,
    });
    this.inputTokens += response.inputTokens;
    this.outputTokens += response.outputTokens;
    this.say(response.text, node.id);
  }

  result(): EngineResult {
    return {
      state: this.state,
      utterances: this.out,
      qualification: qualify(this.engine.agent.qualification, this.state.answers),
      usage: { inputTokens: this.inputTokens, outputTokens: this.outputTokens },
    };
  }
}
