import { createHash } from 'node:crypto';
import { z } from 'zod';

/**
 * The AI Agent definition (PRD FR-26–FR-31, ADR-022): settings plus a typed conversation
 * workflow. The API is the authority: the builder's graph is re-validated here on every save.
 */

export const AGENT_LANGUAGES = ['en', 'hi', 'ml', 'ta', 'te', 'kn'] as const;
export type AgentLanguage = (typeof AGENT_LANGUAGES)[number];

export const ANSWER_TYPES = ['yes_no', 'single_choice', 'number', 'date', 'free_text'] as const;
export type AnswerType = (typeof ANSWER_TYPES)[number];

export const EDGE_INTENTS = ['affirm', 'deny', 'not_interested', 'callback'] as const;
export type EdgeIntent = (typeof EDGE_INTENTS)[number];

export const END_OUTCOMES = [
  'INTERESTED',
  'NOT_INTERESTED',
  'CALLBACK_REQUESTED',
  'COMPLETED',
] as const;

export const COMPARE_OPS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in'] as const;
export type CompareOp = (typeof COMPARE_OPS)[number];

/**
 * Tools an agent may be allowed to use (CLAUDE.md "AI tools"). Each is declared with its tenant
 * scope, side effect and audit flag; execution arrives with the live voice pipeline (Phase 4b).
 */
export const AGENT_TOOLS = {
  'lead.read': {
    label: 'Read customer',
    description: 'Read the called lead’s name, status and approved fields.',
    sideEffect: 'none',
    audited: false,
    timeoutMs: 2_000,
  },
  'lead.update_status': {
    label: 'Update customer status',
    description: 'Record the conversation outcome as a lead status change.',
    sideEffect: 'writes lead status (idempotent per call)',
    audited: true,
    timeoutMs: 3_000,
  },
  'callback.schedule': {
    label: 'Schedule a callback',
    description: 'Set the time the person asked to be called back.',
    sideEffect: 'writes the next attempt time',
    audited: true,
    timeoutMs: 3_000,
  },
  'handoff.request': {
    label: 'Transfer to a human',
    description: 'Hand the call to the escalation target.',
    sideEffect: 'starts a handoff',
    audited: true,
    timeoutMs: 5_000,
  },
} as const;
export type AgentTool = keyof typeof AGENT_TOOLS;
const toolNames = Object.keys(AGENT_TOOLS) as [AgentTool, ...AgentTool[]];

const nodeId = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, 'ids use letters, digits, _ and -');
const answerKey = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, 'keys are lower_snake_case');
const position = z.object({ x: z.number().finite(), y: z.number().finite() });
const shortText = (max: number) => z.string().trim().max(max);
const compareValue = z.union([
  z.string().max(200),
  z.number().finite(),
  z.boolean(),
  z.array(z.string().max(200)).max(20),
]);

export const conditionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('always') }),
  z.object({
    type: z.literal('answer'),
    key: answerKey,
    op: z.enum(COMPARE_OPS),
    value: compareValue,
  }),
  z.object({ type: z.literal('intent'), intent: z.enum(EDGE_INTENTS) }),
]);
export type EdgeCondition = z.infer<typeof conditionSchema>;

export const nodeSchema = z.discriminatedUnion('type', [
  z.object({
    id: nodeId,
    type: z.literal('start'),
    position,
    data: z.object({ greeting: shortText(500) }),
  }),
  z.object({
    id: nodeId,
    type: z.literal('question'),
    position,
    data: z.object({
      key: answerKey,
      prompt: shortText(500).min(1),
      answerType: z.enum(ANSWER_TYPES),
      options: z.array(shortText(100).min(1)).max(12).default([]),
      required: z.boolean().default(true),
    }),
  }),
  z.object({
    id: nodeId,
    type: z.literal('agent'),
    position,
    data: z.object({
      instructions: shortText(2_000).min(1),
      maxTurns: z.number().int().min(1).max(10).default(3),
    }),
  }),
  z.object({
    id: nodeId,
    type: z.literal('handoff'),
    position,
    data: z.object({ message: shortText(300).min(1) }),
  }),
  z.object({
    id: nodeId,
    type: z.literal('end'),
    position,
    data: z.object({ outcome: z.enum(END_OUTCOMES), message: shortText(500).min(1) }),
  }),
]);
export type WorkflowNode = z.infer<typeof nodeSchema>;

export const edgeSchema = z.object({
  id: nodeId,
  source: nodeId,
  target: nodeId,
  condition: conditionSchema,
});
export type WorkflowEdge = z.infer<typeof edgeSchema>;

export const agentDefinitionSchema = z.object({
  schemaVersion: z.literal(1),
  personaName: shortText(60).min(1),
  companyName: shortText(120).min(1),
  purpose: shortText(300).min(1),
  primaryLanguage: z.enum(AGENT_LANGUAGES),
  otherLanguages: z.array(z.enum(AGENT_LANGUAGES)).max(AGENT_LANGUAGES.length).default([]),
  /** Chosen from the speech provider's catalogue once it is connected (ADR-011). */
  voice: z.string().max(80).nullable().default(null),
  callLimits: z
    .object({
      maxCallSeconds: z.number().int().min(60).max(1_800).default(300),
      silenceTimeoutSeconds: z.number().int().min(3).max(30).default(8),
      maxReprompts: z.number().int().min(0).max(5).default(2),
    })
    .prefault({}),
  recordingEnabled: z.boolean().default(false),
  escalation: z
    .object({
      /** An explicit request for a human always hands off (FR-29); it cannot be turned off. */
      humanRequest: z.literal(true).default(true),
      afterRepromptsExhausted: z.boolean().default(false),
      target: shortText(120).nullable().default(null),
    })
    .prefault({}),
  knowledge: z.string().max(20_000).default(''),
  objectionGuidance: z.string().max(5_000).default(''),
  tools: z.array(z.enum(toolNames)).max(toolNames.length).default([]),
  qualification: z
    .object({
      mode: z.enum(['ALL', 'ANY']).default('ALL'),
      rules: z
        .array(z.object({ key: answerKey, op: z.enum(COMPARE_OPS), value: compareValue }))
        .max(20)
        .default([]),
    })
    .prefault({}),
  workflow: z.object({
    nodes: z.array(nodeSchema).min(1).max(200),
    edges: z.array(edgeSchema).max(400),
  }),
});

export type AgentDefinition = z.infer<typeof agentDefinitionSchema>;
export type AgentDefinitionInput = z.input<typeof agentDefinitionSchema>;

/** Identifies a definition's content (published versions are compared by it). */
export function definitionChecksum(definition: AgentDefinition): string {
  return createHash('sha256').update(JSON.stringify(definition)).digest('hex');
}

const TERMINAL = new Set(['end', 'handoff']);

/**
 * Graph rules the schema cannot express (ADR-022 §1). Returns human-readable problems; an empty
 * list means the workflow can be published.
 */
export function workflowProblems(definition: AgentDefinition): string[] {
  const problems: string[] = [];
  const { nodes, edges } = definition.workflow;
  const byId = new Map<string, WorkflowNode>();
  for (const node of nodes) {
    if (byId.has(node.id)) problems.push(`Two steps share the id "${node.id}".`);
    byId.set(node.id, node);
  }
  const starts = nodes.filter((n) => n.type === 'start');
  if (starts.length !== 1) problems.push('The workflow needs exactly one start step.');

  const edgeIds = new Set<string>();
  const outgoing = new Map<string, WorkflowEdge[]>();
  for (const edge of edges) {
    if (edgeIds.has(edge.id)) problems.push(`Two connections share the id "${edge.id}".`);
    edgeIds.add(edge.id);
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target) {
      problems.push(`Connection "${edge.id}" points to a step that does not exist.`);
      continue;
    }
    if (TERMINAL.has(source.type))
      problems.push(`"${label(source)}" ends the call, so it cannot lead anywhere.`);
    if (target.type === 'start') problems.push('Nothing can lead back to the start step.');
    if (source.type === 'start' && edge.condition.type !== 'always') {
      problems.push('The start step can only continue unconditionally.');
    }
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge]);
  }

  const questions = new Map<string, Extract<WorkflowNode, { type: 'question' }>>();
  for (const node of nodes) {
    if (node.type !== 'question') continue;
    if (questions.has(node.data.key))
      problems.push(`Two questions store their answer as "${node.data.key}".`);
    questions.set(node.data.key, node);
    if (node.data.answerType === 'single_choice' && node.data.options.length < 2) {
      problems.push(
        `"${node.data.key}" is a single-choice question and needs at least two options.`,
      );
    }
  }
  const checkAnswerCondition = (key: string, op: CompareOp, value: unknown, where: string) => {
    const question = questions.get(key);
    if (!question) {
      problems.push(`${where} uses the answer "${key}", but no question stores it.`);
      return;
    }
    const type = question.data.answerType;
    const numeric = ['gt', 'gte', 'lt', 'lte'].includes(op);
    if (numeric && type !== 'number')
      problems.push(`${where} compares "${key}" as a number, but it is not a number question.`);
    if (type === 'yes_no' && op !== 'in' && typeof value !== 'boolean' && !numeric) {
      problems.push(`${where} must compare the yes/no answer "${key}" with true or false.`);
    }
    if (type === 'single_choice') {
      const values = Array.isArray(value) ? value : [value];
      for (const v of values) {
        if (
          typeof v !== 'string' ||
          !question.data.options.some((o) => o.toLowerCase() === v.toLowerCase())
        ) {
          problems.push(
            `${where} checks "${key}" for "${String(v)}", which is not one of its options.`,
          );
        }
      }
    }
    if (op === 'in' && !Array.isArray(value))
      problems.push(`${where} uses "in" but its value is not a list.`);
  };
  for (const edge of edges) {
    if (edge.condition.type === 'answer') {
      checkAnswerCondition(
        edge.condition.key,
        edge.condition.op,
        edge.condition.value,
        `Connection "${edge.id}"`,
      );
    }
  }
  for (const rule of definition.qualification.rules) {
    checkAnswerCondition(rule.key, rule.op, rule.value, 'A qualification rule');
  }

  // Every step that talks must have a fallback exit, so a conversation can never get stuck.
  for (const node of nodes) {
    if (TERMINAL.has(node.type)) continue;
    const exits = outgoing.get(node.id) ?? [];
    if (!exits.some((e) => e.condition.type === 'always')) {
      problems.push(
        `"${label(node)}" needs an "otherwise" connection so the call can always move on.`,
      );
    }
  }

  const start = starts[0];
  if (start) {
    const seen = new Set<string>([start.id]);
    const queue = [start.id];
    while (queue.length > 0) {
      const id = queue.shift() as string;
      for (const edge of outgoing.get(id) ?? []) {
        if (!seen.has(edge.target) && byId.has(edge.target)) {
          seen.add(edge.target);
          queue.push(edge.target);
        }
      }
    }
    for (const node of nodes) {
      if (!seen.has(node.id)) problems.push(`"${label(node)}" cannot be reached from the start.`);
    }
    if (![...seen].some((id) => TERMINAL.has(byId.get(id)?.type ?? ''))) {
      problems.push('The workflow never ends: add an end or handoff step.');
    }
  }
  return [...new Set(problems)];
}

function label(node: WorkflowNode): string {
  switch (node.type) {
    case 'question':
      return node.data.key;
    case 'end':
      return `end (${node.data.outcome.toLowerCase().replace(/_/g, ' ')})`;
    default:
      return `${node.type} ${node.id}`;
  }
}

/** A small, valid starting workflow for a new agent. */
export function starterDefinition(input: {
  companyName: string;
  personaName?: string | undefined;
  purpose?: string | undefined;
}): AgentDefinition {
  return agentDefinitionSchema.parse({
    schemaVersion: 1,
    personaName: input.personaName ?? 'Maya',
    companyName: input.companyName,
    purpose: input.purpose ?? 'your recent enquiry',
    primaryLanguage: 'en',
    workflow: {
      nodes: [
        {
          id: 'start',
          type: 'start',
          position: { x: 0, y: 0 },
          data: { greeting: 'Is this a good time to talk for two minutes?' },
        },
        {
          id: 'interest',
          type: 'question',
          position: { x: 0, y: 160 },
          data: {
            key: 'interested',
            prompt: 'Would you like to hear more about it?',
            answerType: 'yes_no',
            required: true,
          },
        },
        {
          id: 'pitch',
          type: 'agent',
          position: { x: -220, y: 330 },
          data: {
            instructions:
              'Briefly explain the offer using only the approved knowledge, then answer questions.',
            maxTurns: 3,
          },
        },
        {
          id: 'done',
          type: 'end',
          position: { x: -220, y: 500 },
          data: {
            outcome: 'INTERESTED',
            message: 'Thank you! Our team will follow up with the details. Goodbye.',
          },
        },
        {
          id: 'no',
          type: 'end',
          position: { x: 220, y: 330 },
          data: {
            outcome: 'NOT_INTERESTED',
            message: 'No problem at all. Thank you for your time. Goodbye.',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'interest', condition: { type: 'always' } },
        {
          id: 'e2',
          source: 'interest',
          target: 'pitch',
          condition: { type: 'answer', key: 'interested', op: 'eq', value: true },
        },
        { id: 'e3', source: 'interest', target: 'no', condition: { type: 'always' } },
        {
          id: 'e4',
          source: 'pitch',
          target: 'no',
          condition: { type: 'intent', intent: 'not_interested' },
        },
        { id: 'e5', source: 'pitch', target: 'done', condition: { type: 'always' } },
      ],
    },
  });
}
