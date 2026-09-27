'use client';

import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useEffect, useMemo, useState } from 'react';
import {
  ANSWER_TYPES,
  ANSWER_TYPE_LABELS,
  COMPARE_LABELS,
  COMPARE_OPS,
  EDGE_INTENTS,
  END_OUTCOMES,
  END_OUTCOME_LABELS,
  INTENT_LABELS,
  type AnswerType,
  type CompareOp,
  type EdgeCondition,
  type EdgeIntent,
  type EndOutcome,
  type WorkflowEdge,
  type WorkflowNode,
  type WorkflowNodeType,
} from '@/lib/api/types';
import { cx } from '@/lib/site/cx';
import { Field, SelectField, selectClass } from '../ui';

export interface Workflow {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

const TYPE_LABELS: Record<WorkflowNodeType, string> = {
  start: 'Start',
  question: 'Question',
  agent: 'AI conversation',
  handoff: 'Transfer to a human',
  end: 'End call',
};

const TYPE_STYLES: Record<WorkflowNodeType, string> = {
  start: 'border-accent-tint bg-accent-soft',
  question: 'border-line bg-card',
  agent: 'border-soon/30 bg-soon-soft',
  handoff: 'border-warn/30 bg-warn-soft',
  end: 'border-live/30 bg-live-soft',
};

function summary(node: WorkflowNode): string {
  switch (node.type) {
    case 'start':
      return node.data.greeting || 'Platform opening, then the first step';
    case 'question':
      return `${node.data.prompt} → ${node.data.key}`;
    case 'agent':
      return node.data.instructions;
    case 'handoff':
      return node.data.message;
    case 'end':
      return `${END_OUTCOME_LABELS[node.data.outcome]}: ${node.data.message}`;
  }
}

export function conditionLabel(condition: EdgeCondition): string {
  switch (condition.type) {
    case 'always':
      return 'otherwise';
    case 'intent':
      return `if the person ${INTENT_LABELS[condition.intent]}`;
    case 'answer': {
      const value = Array.isArray(condition.value)
        ? condition.value.join(', ')
        : typeof condition.value === 'boolean'
          ? condition.value
            ? 'yes'
            : 'no'
          : String(condition.value);
      return `if ${condition.key} ${COMPARE_LABELS[condition.op]} ${value}`;
    }
  }
}

type StepNodeData = { node: WorkflowNode };

function StepNode({ data, selected }: NodeProps<Node<StepNodeData>>) {
  const node = data.node;
  return (
    <div
      className={cx(
        'w-[240px] rounded-[14px] border px-3.5 py-3 text-left shadow-sm',
        TYPE_STYLES[node.type],
        selected && 'ring-2 ring-accent',
      )}
    >
      {node.type !== 'start' ? <Handle type="target" position={Position.Top} /> : null}
      <p className="text-[11px] font-bold tracking-[0.08em] text-muted uppercase">
        {TYPE_LABELS[node.type]}
      </p>
      <p className="mt-1 line-clamp-3 text-[13px] text-ink">{summary(node)}</p>
      {node.type !== 'end' && node.type !== 'handoff' ? (
        <Handle type="source" position={Position.Bottom} />
      ) : null}
    </div>
  );
}

const NODE_TYPES = { step: StepNode };

/** Follows the app theme (a `data-theme` attribute on <html>). */
function useColorMode(): 'light' | 'dark' {
  const [mode, setMode] = useState<'light' | 'dark'>('dark');
  useEffect(() => {
    const read = () =>
      setMode(document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);
  return mode;
}

function uniqueId(prefix: string, taken: ReadonlySet<string>): string {
  for (let i = 1; ; i += 1) {
    const id = `${prefix}${i}`;
    if (!taken.has(id)) return id;
  }
}

function newNode(
  type: Exclude<WorkflowNodeType, 'start'>,
  id: string,
  keys: ReadonlySet<string>,
  at: { x: number; y: number },
): WorkflowNode {
  const position = at;
  switch (type) {
    case 'question':
      return {
        id,
        type,
        position,
        data: {
          key: uniqueId('answer_', keys),
          prompt: 'Your question?',
          answerType: 'yes_no',
          options: [],
          required: true,
        },
      };
    case 'agent':
      return {
        id,
        type,
        position,
        data: { instructions: 'Answer questions using only the approved knowledge.', maxTurns: 3 },
      };
    case 'handoff':
      return {
        id,
        type,
        position,
        data: { message: "I'm connecting you to a member of our team now." },
      };
    case 'end':
      return {
        id,
        type,
        position,
        data: { outcome: 'COMPLETED', message: 'Thank you for your time. Goodbye.' },
      };
  }
}

/**
 * The conversation workflow editor (ADR-022 §6). A React Flow canvas for the graph, plus a side
 * panel that edits the selected step or connection — also the keyboard-accessible way to edit.
 * The server re-validates everything on save.
 */
export function WorkflowBuilder({
  value,
  onChange,
  readOnly,
}: {
  readonly value: Workflow;
  readonly onChange: (next: Workflow) => void;
  readonly readOnly: boolean;
}) {
  const colorMode = useColorMode();
  const [selected, setSelected] = useState<{ kind: 'node' | 'edge'; id: string } | null>(null);

  const rfNodes: Node<StepNodeData>[] = useMemo(
    () =>
      value.nodes.map((node) => ({
        id: node.id,
        type: 'step',
        position: node.position,
        data: { node },
        selected: selected?.kind === 'node' && selected.id === node.id,
        deletable: !readOnly && node.type !== 'start',
      })),
    [value.nodes, selected, readOnly],
  );
  const rfEdges: Edge[] = useMemo(
    () =>
      value.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: conditionLabel(edge.condition),
        markerEnd: { type: MarkerType.ArrowClosed },
        selected: selected?.kind === 'edge' && selected.id === edge.id,
        deletable: !readOnly,
        labelBgPadding: [6, 3] as [number, number],
        labelBgBorderRadius: 6,
      })),
    [value.edges, selected, readOnly],
  );

  const onNodesChange = (changes: NodeChange<Node<StepNodeData>>[]) => {
    if (readOnly) return;
    const next = applyNodeChanges(changes, rfNodes);
    const ids = new Set(next.map((n) => n.id));
    const nodes = value.nodes
      .filter((n) => ids.has(n.id))
      .map((n) => {
        const moved = next.find((m) => m.id === n.id);
        return moved
          ? { ...n, position: { x: Math.round(moved.position.x), y: Math.round(moved.position.y) } }
          : n;
      });
    const edges = value.edges.filter((e) => ids.has(e.source) && ids.has(e.target));
    if (changes.some((c) => c.type === 'position' || c.type === 'remove'))
      onChange({ nodes, edges });
  };

  const onEdgesChange = (changes: EdgeChange[]) => {
    if (readOnly || !changes.some((c) => c.type === 'remove')) return;
    const kept = new Set(applyEdgeChanges(changes, rfEdges).map((e) => e.id));
    onChange({ ...value, edges: value.edges.filter((e) => kept.has(e.id)) });
  };

  const onConnect = (connection: Connection) => {
    if (readOnly || !connection.source || !connection.target) return;
    const id = uniqueId('e', new Set(value.edges.map((e) => e.id)));
    const edge: WorkflowEdge = {
      id,
      source: connection.source,
      target: connection.target,
      condition: { type: 'always' },
    };
    onChange({ ...value, edges: [...value.edges, edge] });
    setSelected({ kind: 'edge', id });
  };

  const add = (type: Exclude<WorkflowNodeType, 'start'>) => {
    const ids = new Set(value.nodes.map((n) => n.id));
    const keys = new Set(value.nodes.flatMap((n) => (n.type === 'question' ? [n.data.key] : [])));
    const lowest = Math.max(0, ...value.nodes.map((n) => n.position.y));
    const node = newNode(type, uniqueId(type === 'agent' ? 'ai' : type, ids), keys, {
      x: 0,
      y: lowest + 170,
    });
    onChange({ ...value, nodes: [...value.nodes, node] });
    setSelected({ kind: 'node', id: node.id });
  };

  const selectedNode =
    selected?.kind === 'node' ? value.nodes.find((n) => n.id === selected.id) : undefined;
  const selectedEdge =
    selected?.kind === 'edge' ? value.edges.find((e) => e.id === selected.id) : undefined;

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <div className="grid gap-3">
        {!readOnly ? (
          <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Add a step">
            {(['question', 'agent', 'handoff', 'end'] as const).map((type) => (
              <button
                key={type}
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => add(type)}
              >
                + {TYPE_LABELS[type]}
              </button>
            ))}
          </div>
        ) : null}
        <div
          className="h-[560px] overflow-hidden rounded-[16px] border border-line bg-soft"
          aria-label="Conversation workflow canvas"
        >
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={NODE_TYPES}
            colorMode={colorMode}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelected({ kind: 'node', id: node.id })}
            onEdgeClick={(_, edge) => setSelected({ kind: 'edge', id: edge.id })}
            onPaneClick={() => setSelected(null)}
            nodesDraggable={!readOnly}
            nodesConnectable={!readOnly}
            deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']}
            fitView
            proOptions={{ hideAttribution: false }}
          >
            <Background gap={20} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
        <StepList value={value} onSelect={(id) => setSelected({ kind: 'node', id })} />
      </div>
      <aside className="card-nv h-fit p-5" aria-label="Selected step">
        {selectedNode ? (
          <NodeEditor
            key={selectedNode.id}
            node={selectedNode}
            readOnly={readOnly}
            onChange={(node) =>
              onChange({ ...value, nodes: value.nodes.map((n) => (n.id === node.id ? node : n)) })
            }
            onDelete={() => {
              onChange({
                nodes: value.nodes.filter((n) => n.id !== selectedNode.id),
                edges: value.edges.filter(
                  (e) => e.source !== selectedNode.id && e.target !== selectedNode.id,
                ),
              });
              setSelected(null);
            }}
            exits={value.edges.filter((e) => e.source === selectedNode.id)}
            onSelectEdge={(id) => setSelected({ kind: 'edge', id })}
          />
        ) : selectedEdge ? (
          <EdgeEditor
            key={selectedEdge.id}
            edge={selectedEdge}
            nodes={value.nodes}
            readOnly={readOnly}
            onChange={(edge) =>
              onChange({ ...value, edges: value.edges.map((e) => (e.id === edge.id ? edge : e)) })
            }
            onMoveEarlier={() => {
              const siblings = value.edges.filter((e) => e.source === selectedEdge.source);
              const index = siblings.findIndex((e) => e.id === selectedEdge.id);
              const previous = siblings[index - 1];
              if (!previous) return;
              const edges = [...value.edges];
              const a = edges.findIndex((e) => e.id === previous.id);
              const b = edges.findIndex((e) => e.id === selectedEdge.id);
              [edges[a], edges[b]] = [selectedEdge, previous];
              onChange({ ...value, edges });
            }}
            onDelete={() => {
              onChange({ ...value, edges: value.edges.filter((e) => e.id !== selectedEdge.id) });
              setSelected(null);
            }}
          />
        ) : (
          <div className="text-sm text-muted">
            <p className="font-semibold text-ink">Select a step or a connection</p>
            <p className="mt-2">
              Drag from the bottom dot of a step to the top of another to connect them. Connections
              from a step are checked in order; the first that matches is followed, and every step
              needs an “otherwise” connection.
            </p>
            <p className="mt-2">
              Asking not to be called again, or for a human, always ends or transfers the call — no
              workflow can change that.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}

/** A plain list of steps: a non-visual way to find and select any step. */
function StepList({
  value,
  onSelect,
}: {
  readonly value: Workflow;
  readonly onSelect: (id: string) => void;
}) {
  return (
    <details className="rounded-[14px] border border-line bg-card px-4 py-3 text-sm">
      <summary className="cursor-pointer font-semibold text-ink">
        All steps ({value.nodes.length})
      </summary>
      <ul className="mt-2 grid gap-1">
        {value.nodes.map((node) => (
          <li key={node.id}>
            <button
              type="button"
              className="text-left text-accent hover:underline"
              onClick={() => onSelect(node.id)}
            >
              {TYPE_LABELS[node.type]}: {summary(node).slice(0, 80)}
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

function TextArea({
  id,
  label,
  value,
  onChange,
  maxLength,
  disabled,
  hint,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly maxLength: number;
  readonly disabled: boolean;
  readonly hint?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
      </label>
      <textarea
        id={id}
        className={cx(selectClass, 'min-h-24')}
        value={value}
        maxLength={maxLength}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint ? <p className="mt-1.5 text-[13px] text-muted">{hint}</p> : null}
    </div>
  );
}

function NodeEditor({
  node,
  readOnly,
  onChange,
  onDelete,
  exits,
  onSelectEdge,
}: {
  readonly node: WorkflowNode;
  readonly readOnly: boolean;
  readonly onChange: (node: WorkflowNode) => void;
  readonly onDelete: () => void;
  readonly exits: WorkflowEdge[];
  readonly onSelectEdge: (id: string) => void;
}) {
  const body = (() => {
    switch (node.type) {
      case 'start':
        return (
          <TextArea
            id="node-greeting"
            label="Greeting after the opening"
            maxLength={500}
            disabled={readOnly}
            value={node.data.greeting}
            onChange={(greeting) => onChange({ ...node, data: { greeting } })}
            hint="Nivomi always says first that this is an AI assistant, who is calling and why (and that the call is recorded, when it is)."
          />
        );
      case 'question':
        return (
          <>
            <TextArea
              id="node-prompt"
              label="Question"
              maxLength={500}
              disabled={readOnly}
              value={node.data.prompt}
              onChange={(prompt) => onChange({ ...node, data: { ...node.data, prompt } })}
            />
            <Field
              id="node-key"
              label="Save the answer as"
              value={node.data.key}
              disabled={readOnly}
              maxLength={40}
              hint="lower_snake_case, used in conditions and qualification rules"
              onChange={(e) => onChange({ ...node, data: { ...node.data, key: e.target.value } })}
            />
            <SelectField
              id="node-answer-type"
              label="Answer type"
              value={node.data.answerType}
              disabled={readOnly}
              onChange={(v) =>
                onChange({ ...node, data: { ...node.data, answerType: v as AnswerType } })
              }
              options={ANSWER_TYPES.map((t) => ({ value: t, label: ANSWER_TYPE_LABELS[t] }))}
            />
            {node.data.answerType === 'single_choice' ? (
              <Field
                id="node-options"
                label="Options (comma-separated)"
                value={node.data.options.join(', ')}
                disabled={readOnly}
                onChange={(e) =>
                  onChange({
                    ...node,
                    data: {
                      ...node.data,
                      options: e.target.value
                        .split(',')
                        .map((o) => o.trim())
                        .filter(Boolean),
                    },
                  })
                }
              />
            ) : null}
          </>
        );
      case 'agent':
        return (
          <>
            <TextArea
              id="node-instructions"
              label="What the AI should do in this step"
              maxLength={2000}
              disabled={readOnly}
              value={node.data.instructions}
              onChange={(instructions) =>
                onChange({ ...node, data: { ...node.data, instructions } })
              }
              hint="It can only state facts from the approved knowledge."
            />
            <Field
              id="node-turns"
              label="Maximum replies before moving on"
              type="number"
              min={1}
              max={10}
              disabled={readOnly}
              value={node.data.maxTurns}
              onChange={(e) =>
                onChange({ ...node, data: { ...node.data, maxTurns: Number(e.target.value) || 1 } })
              }
            />
          </>
        );
      case 'handoff':
        return (
          <TextArea
            id="node-handoff"
            label="What to say before transferring"
            maxLength={300}
            disabled={readOnly}
            value={node.data.message}
            onChange={(message) => onChange({ ...node, data: { message } })}
          />
        );
      case 'end':
        return (
          <>
            <SelectField
              id="node-outcome"
              label="Outcome"
              value={node.data.outcome}
              disabled={readOnly}
              onChange={(v) =>
                onChange({ ...node, data: { ...node.data, outcome: v as EndOutcome } })
              }
              options={END_OUTCOMES.map((o) => ({ value: o, label: END_OUTCOME_LABELS[o] }))}
            />
            <TextArea
              id="node-closing"
              label="Closing words"
              maxLength={500}
              disabled={readOnly}
              value={node.data.message}
              onChange={(message) => onChange({ ...node, data: { ...node.data, message } })}
            />
          </>
        );
    }
  })();
  return (
    <div className="grid gap-4">
      <p className="text-xs font-bold tracking-[0.08em] text-muted uppercase">
        {TYPE_LABELS[node.type]}
      </p>
      {body}
      {exits.length > 0 ? (
        <div>
          <p className="text-sm font-semibold text-ink">Next, checked in order</p>
          <ol className="mt-1.5 grid gap-1 text-sm">
            {exits.map((edge) => (
              <li key={edge.id}>
                <button
                  type="button"
                  className="text-left text-accent hover:underline"
                  onClick={() => onSelectEdge(edge.id)}
                >
                  {conditionLabel(edge.condition)} → {edge.target}
                </button>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      {!readOnly && node.type !== 'start' ? (
        <button type="button" className="btn btn-secondary btn-sm w-fit" onClick={onDelete}>
          Delete step
        </button>
      ) : null}
    </div>
  );
}

function EdgeEditor({
  edge,
  nodes,
  readOnly,
  onChange,
  onMoveEarlier,
  onDelete,
}: {
  readonly edge: WorkflowEdge;
  readonly nodes: WorkflowNode[];
  readonly readOnly: boolean;
  readonly onChange: (edge: WorkflowEdge) => void;
  readonly onMoveEarlier: () => void;
  readonly onDelete: () => void;
}) {
  const questions = nodes.flatMap((n) => (n.type === 'question' ? [n] : []));
  const condition = edge.condition;
  const set = (next: EdgeCondition) => onChange({ ...edge, condition: next });
  const fromStart = nodes.find((n) => n.id === edge.source)?.type === 'start';
  const question =
    condition.type === 'answer' ? questions.find((q) => q.data.key === condition.key) : undefined;

  return (
    <div className="grid gap-4">
      <p className="text-xs font-bold tracking-[0.08em] text-muted uppercase">
        Connection {edge.source} → {edge.target}
      </p>
      <SelectField
        id="edge-type"
        label="Follow it"
        value={condition.type}
        disabled={readOnly || fromStart}
        onChange={(type) => {
          if (type === 'always') set({ type: 'always' });
          if (type === 'intent') set({ type: 'intent', intent: 'affirm' });
          if (type === 'answer') {
            const first = questions[0];
            set({
              type: 'answer',
              key: first?.data.key ?? '',
              op: 'eq',
              value: first?.data.answerType === 'yes_no' ? true : '',
            });
          }
        }}
        options={[
          { value: 'always', label: 'Otherwise (always)' },
          { value: 'answer', label: 'When an answer matches' },
          { value: 'intent', label: 'When the person…' },
        ]}
        {...(fromStart ? { hint: 'The start always continues to the first step.' } : {})}
      />
      {condition.type === 'intent' ? (
        <SelectField
          id="edge-intent"
          label="The person…"
          value={condition.intent}
          disabled={readOnly}
          onChange={(intent) => set({ type: 'intent', intent: intent as EdgeIntent })}
          options={EDGE_INTENTS.map((i) => ({ value: i, label: INTENT_LABELS[i] }))}
        />
      ) : null}
      {condition.type === 'answer' ? (
        <>
          <SelectField
            id="edge-key"
            label="Answer"
            value={condition.key}
            disabled={readOnly}
            onChange={(key) => set({ ...condition, key })}
            options={questions.map((q) => ({ value: q.data.key, label: q.data.key }))}
          />
          <SelectField
            id="edge-op"
            label="Comparison"
            value={condition.op}
            disabled={readOnly}
            onChange={(op) => set({ ...condition, op: op as CompareOp })}
            options={COMPARE_OPS.map((o) => ({ value: o, label: COMPARE_LABELS[o] }))}
          />
          {question?.data.answerType === 'yes_no' ? (
            <SelectField
              id="edge-value"
              label="Value"
              value={String(condition.value)}
              disabled={readOnly}
              onChange={(v) => set({ ...condition, value: v === 'true' })}
              options={[
                { value: 'true', label: 'Yes' },
                { value: 'false', label: 'No' },
              ]}
            />
          ) : (
            <Field
              id="edge-value"
              label={condition.op === 'in' ? 'Values (comma-separated)' : 'Value'}
              disabled={readOnly}
              value={
                Array.isArray(condition.value)
                  ? condition.value.join(', ')
                  : String(condition.value)
              }
              onChange={(e) => {
                const raw = e.target.value;
                set({
                  ...condition,
                  value:
                    condition.op === 'in'
                      ? raw
                          .split(',')
                          .map((v) => v.trim())
                          .filter(Boolean)
                      : question?.data.answerType === 'number' &&
                          raw !== '' &&
                          !Number.isNaN(Number(raw))
                        ? Number(raw)
                        : raw,
                });
              }}
            />
          )}
        </>
      ) : null}
      {!readOnly ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onMoveEarlier}>
            Check earlier
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onDelete}>
            Delete connection
          </button>
        </div>
      ) : null}
    </div>
  );
}
