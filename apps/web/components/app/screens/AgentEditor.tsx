'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  AGENT_LANGUAGES,
  COMPARE_LABELS,
  COMPARE_OPS,
  LANGUAGE_LABELS,
  type AgentDefinition,
  type AgentDetail,
  type AgentLanguage,
  type AgentTool,
  type CompareOp,
} from '@/lib/api/types';
import { api } from '@/lib/app/api';
import { formatDateTime } from '@/lib/app/format';
import { useSession } from '@/lib/app/session';
import { useResource } from '@/lib/app/use-resource';
import { useSubmit } from '@/lib/app/use-submit';
import { cx } from '@/lib/site/cx';
import { TestChat } from '../agents/TestChat';
import { WorkflowBuilder } from '../agents/WorkflowBuilder';
import {
  Badge,
  ErrorBlock,
  Field,
  FormAlert,
  LoadingBlock,
  Notice,
  PageHeader,
  Panel,
  SelectField,
  selectClass,
} from '../ui';
import { AGENT_STATUS } from './Agents';

type Tab = 'conversation' | 'settings' | 'test' | 'versions';
const TABS: { id: Tab; label: string }[] = [
  { id: 'conversation', label: 'Conversation' },
  { id: 'settings', label: 'Settings' },
  { id: 'test', label: 'Test chat' },
  { id: 'versions', label: 'Versions' },
];

/** PRD FR-26–FR-32: build, test and publish one AI Agent. */
export function AgentEditor({ id }: { readonly id: string }) {
  const { can } = useSession();
  const agent = useResource<AgentDetail>(`/agents/${id}`);
  const tools = useResource<{ items: AgentTool[] }>('/agents/tools');
  const [tab, setTab] = useState<Tab>('conversation');
  const [draft, setDraft] = useState<AgentDefinition | null>(null);
  const [name, setName] = useState('');
  const [dirty, setDirty] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [published, setPublished] = useState<string | null>(null);
  const save = useSubmit();
  const publish = useSubmit();

  useEffect(() => {
    if (!agent.data) return;
    setDraft(agent.data.definition);
    setName(agent.data.name);
    setProblems(agent.data.problems);
    setDirty(false);
  }, [agent.data]);

  if (agent.error && !agent.data) {
    return (
      <div className="grid gap-6">
        <PageHeader title="AI agent" />
        <ErrorBlock message={agent.error} onRetry={agent.reload} />
      </div>
    );
  }
  if (!agent.data || !draft) return <LoadingBlock label="Loading agent" />;
  const data = agent.data;
  const editable = can('agents.manage') && data.status !== 'ARCHIVED';

  const update = (next: AgentDefinition) => {
    setDraft(next);
    setDirty(true);
    setPublished(null);
  };
  const onSave = async () => {
    let saved: AgentDetail | null = null;
    const ok = await save.run(async () => {
      saved = await api.put<AgentDetail>(`/agents/${id}`, { name, definition: draft });
    });
    if (ok && saved) {
      setProblems((saved as AgentDetail).problems);
      setDirty(false);
      agent.reload();
    }
  };
  const onPublish = async () => {
    let version: number | null = null;
    const ok = await publish.run(async () => {
      if (dirty) await api.put(`/agents/${id}`, { name, definition: draft });
      version = (await api.post<{ version: number }>(`/agents/${id}/publish`)).version;
    });
    if (ok) {
      setPublished(`Version ${version ?? ''} is published. Campaigns can now use it.`);
      agent.reload();
    }
  };

  return (
    <div className="grid gap-6">
      <div>
        <Link href="/app/agents" className="text-sm font-semibold text-accent hover:underline">
          ← All agents
        </Link>
        <div className="mt-3">
          <PageHeader
            title={data.name}
            description={`${data.callCategory === 'PROMOTIONAL' ? 'Sales (promotional)' : 'Service'} calls · ${data.latestVersion ? `latest version ${data.latestVersion}` : 'never published'}`}
            actions={
              <Badge tone={AGENT_STATUS[data.status].tone}>{AGENT_STATUS[data.status].label}</Badge>
            }
          />
        </div>
      </div>

      {editable ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={save.pending || !dirty}
            onClick={() => void onSave()}
          >
            {save.pending ? 'Saving…' : dirty ? 'Save draft' : 'Draft saved'}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={publish.pending || (!dirty && !data.unpublishedChanges)}
            onClick={() => void onPublish()}
          >
            {publish.pending ? 'Publishing…' : 'Publish new version'}
          </button>
          {dirty ? <span className="text-sm text-muted">Unsaved changes</span> : null}
        </div>
      ) : null}
      <FormAlert message={save.error ?? publish.error} />
      {published ? <Notice tone="success">{published}</Notice> : null}
      {problems.length > 0 ? (
        <Notice tone="warn">
          <p className="font-semibold">Fix these before publishing or testing:</p>
          <ul className="mt-1 list-disc pl-5">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Notice>
      ) : null}

      <div
        role="tablist"
        aria-label="Agent sections"
        className="flex flex-wrap gap-1 border-b border-line"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={cx(
              '-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors',
              tab === t.id
                ? 'border-accent text-accent'
                : 'border-transparent text-ink-2 hover:text-ink',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'conversation' ? (
          <WorkflowBuilder
            value={draft.workflow}
            readOnly={!editable}
            onChange={(workflow) => update({ ...draft, workflow })}
          />
        ) : null}
        {tab === 'settings' ? (
          <Settings
            draft={draft}
            name={name}
            onName={(value) => {
              setName(value);
              setDirty(true);
            }}
            editable={editable}
            tools={tools.data?.items ?? []}
            onChange={update}
          />
        ) : null}
        {tab === 'test' ? (
          <TestChat
            agentId={id}
            versions={data.versions}
            dirty={dirty}
            canTest={can('agents.manage')}
          />
        ) : null}
        {tab === 'versions' ? (
          <Panel
            title="Published versions"
            description="A version never changes. Campaigns keep the version they were given until someone switches them."
          >
            {data.versions.length === 0 ? (
              <p className="text-sm text-muted">Nothing published yet.</p>
            ) : (
              <ul className="grid gap-2">
                {data.versions.map((v) => (
                  <li
                    key={v.id}
                    className="flex justify-between gap-4 rounded-[12px] border border-line px-4 py-2.5 text-sm"
                  >
                    <span className="font-semibold text-ink">Version {v.version}</span>
                    <span className="text-muted">
                      {formatDateTime(v.createdAt)}
                      {v.publishedBy ? ` · ${v.publishedBy}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        ) : null}
      </div>
    </div>
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
  rows = 4,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly maxLength: number;
  readonly disabled: boolean;
  readonly hint?: string;
  readonly rows?: number;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        className={selectClass}
        value={value}
        maxLength={maxLength}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      <p className="mt-1.5 text-[13px] text-muted">
        {hint ? `${hint} ` : ''}
        {value.length.toLocaleString('en-IN')} / {maxLength.toLocaleString('en-IN')}
      </p>
    </div>
  );
}

/** FR-26, FR-27, FR-29, FR-31 and the tool allowlist. */
function Settings({
  draft,
  name,
  onName,
  editable,
  tools,
  onChange,
}: {
  readonly draft: AgentDefinition;
  readonly name: string;
  readonly onName: (value: string) => void;
  readonly editable: boolean;
  readonly tools: AgentTool[];
  readonly onChange: (next: AgentDefinition) => void;
}) {
  const set = <K extends keyof AgentDefinition>(key: K, value: AgentDefinition[K]) =>
    onChange({ ...draft, [key]: value });
  const questionKeys = draft.workflow.nodes.flatMap((n) =>
    n.type === 'question' ? [n.data.key] : [],
  );
  return (
    <fieldset disabled={!editable} className="grid gap-6">
      <Panel title="Who is calling">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="agent-name-edit"
            label="Agent name (internal)"
            maxLength={120}
            value={name}
            onChange={(e) => onName(e.target.value)}
          />
          <Field
            id="persona"
            label="Introduces itself as"
            maxLength={60}
            value={draft.personaName}
            onChange={(e) => set('personaName', e.target.value)}
          />
          <Field
            id="company"
            label="Company it speaks for"
            maxLength={120}
            value={draft.companyName}
            onChange={(e) => set('companyName', e.target.value)}
          />
          <Field
            id="purpose"
            label="Purpose of the call"
            maxLength={300}
            value={draft.purpose}
            onChange={(e) => set('purpose', e.target.value)}
            hint="Said in the opening: “I’m calling about …”"
          />
          <SelectField
            id="language"
            label="Main language"
            value={draft.primaryLanguage}
            onChange={(v) => set('primaryLanguage', v as AgentLanguage)}
            options={AGENT_LANGUAGES.map((l) => ({ value: l, label: LANGUAGE_LABELS[l] }))}
          />
          <fieldset>
            <legend className="text-sm font-semibold text-ink">Other languages</legend>
            <div className="mt-2 flex flex-wrap gap-3">
              {AGENT_LANGUAGES.filter((l) => l !== draft.primaryLanguage).map((l) => (
                <label key={l} className="flex items-center gap-1.5 text-sm text-ink-2">
                  <input
                    type="checkbox"
                    checked={draft.otherLanguages.includes(l)}
                    onChange={(e) =>
                      set(
                        'otherLanguages',
                        e.target.checked
                          ? [...draft.otherLanguages, l]
                          : draft.otherLanguages.filter((x) => x !== l),
                      )
                    }
                  />
                  {LANGUAGE_LABELS[l]}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        <p className="mt-4 text-[13px] text-muted">
          Voice selection arrives with the speech provider (Phase 4b).
        </p>
      </Panel>

      <Panel
        title="What it may say"
        description="The AI states only these facts. Everything here is treated as information, never as instructions."
      >
        <div className="grid gap-4">
          <TextArea
            id="knowledge"
            label="Approved knowledge"
            rows={8}
            maxLength={20_000}
            disabled={!editable}
            value={draft.knowledge}
            onChange={(v) => set('knowledge', v)}
            hint="Prices and offers must appear here word for word to be mentioned."
          />
          <TextArea
            id="objections"
            label="Objection guidance"
            maxLength={5_000}
            disabled={!editable}
            value={draft.objectionGuidance}
            onChange={(v) => set('objectionGuidance', v)}
          />
        </div>
      </Panel>

      <Panel
        title="Qualification"
        description="Computed from the answers by these rules, never by the AI (FR-28)."
      >
        <div className="grid gap-3">
          <SelectField
            id="qualification-mode"
            label="Qualified when"
            value={draft.qualification.mode}
            onChange={(mode) =>
              set('qualification', { ...draft.qualification, mode: mode as 'ALL' | 'ANY' })
            }
            options={[
              { value: 'ALL', label: 'every rule holds' },
              { value: 'ANY', label: 'any rule holds' },
            ]}
            className="max-w-xs"
          />
          {draft.qualification.rules.map((rule, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
              <SelectField
                id={`rule-key-${index}`}
                label="Answer"
                value={rule.key}
                onChange={(key) =>
                  set('qualification', {
                    ...draft.qualification,
                    rules: draft.qualification.rules.map((r, i) =>
                      i === index ? { ...r, key } : r,
                    ),
                  })
                }
                options={[...new Set([rule.key, ...questionKeys])]
                  .filter(Boolean)
                  .map((k) => ({ value: k, label: k }))}
              />
              <SelectField
                id={`rule-op-${index}`}
                label="Comparison"
                value={rule.op}
                onChange={(op) =>
                  set('qualification', {
                    ...draft.qualification,
                    rules: draft.qualification.rules.map((r, i) =>
                      i === index ? { ...r, op: op as CompareOp } : r,
                    ),
                  })
                }
                options={COMPARE_OPS.map((o) => ({ value: o, label: COMPARE_LABELS[o] }))}
              />
              <Field
                id={`rule-value-${index}`}
                label="Value"
                value={Array.isArray(rule.value) ? rule.value.join(', ') : String(rule.value)}
                onChange={(e) => {
                  const raw = e.target.value;
                  const value =
                    raw === 'true' || raw === 'false'
                      ? raw === 'true'
                      : raw !== '' && !Number.isNaN(Number(raw))
                        ? Number(raw)
                        : raw;
                  set('qualification', {
                    ...draft.qualification,
                    rules: draft.qualification.rules.map((r, i) =>
                      i === index ? { ...r, value } : r,
                    ),
                  });
                }}
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() =>
                  set('qualification', {
                    ...draft.qualification,
                    rules: draft.qualification.rules.filter((_, i) => i !== index),
                  })
                }
              >
                Remove
              </button>
            </div>
          ))}
          {questionKeys.length > 0 ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm w-fit"
              onClick={() =>
                set('qualification', {
                  ...draft.qualification,
                  rules: [
                    ...draft.qualification.rules,
                    { key: questionKeys[0] ?? '', op: 'eq', value: true },
                  ],
                })
              }
            >
              + Add rule
            </button>
          ) : (
            <p className="text-sm text-muted">
              Add a question to the conversation to qualify on its answer.
            </p>
          )}
        </div>
      </Panel>

      <Panel title="Limits, recording and escalation">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            id="max-call"
            label="Longest call (seconds)"
            type="number"
            min={60}
            max={1800}
            value={draft.callLimits.maxCallSeconds}
            onChange={(e) =>
              set('callLimits', { ...draft.callLimits, maxCallSeconds: Number(e.target.value) })
            }
          />
          <Field
            id="silence"
            label="Silence timeout (seconds)"
            type="number"
            min={3}
            max={30}
            value={draft.callLimits.silenceTimeoutSeconds}
            onChange={(e) =>
              set('callLimits', {
                ...draft.callLimits,
                silenceTimeoutSeconds: Number(e.target.value),
              })
            }
          />
          <Field
            id="reprompts"
            label="Re-asks of an unclear answer"
            type="number"
            min={0}
            max={5}
            value={draft.callLimits.maxReprompts}
            onChange={(e) =>
              set('callLimits', { ...draft.callLimits, maxReprompts: Number(e.target.value) })
            }
          />
        </div>
        <div className="mt-4 grid gap-3 text-sm text-ink">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.recordingEnabled}
              onChange={(e) => set('recordingEnabled', e.target.checked)}
            />
            Record calls (the opening then announces the recording)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked disabled />
            Transfer to a human whenever the person asks (always on)
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.escalation.afterRepromptsExhausted}
              onChange={(e) =>
                set('escalation', {
                  ...draft.escalation,
                  afterRepromptsExhausted: e.target.checked,
                })
              }
            />
            Also transfer when an answer stays unclear after the re-asks
          </label>
          <Field
            id="escalation-target"
            label="Transfer to"
            maxLength={120}
            placeholder="the sales desk"
            value={draft.escalation.target ?? ''}
            onChange={(e) =>
              set('escalation', { ...draft.escalation, target: e.target.value || null })
            }
            className="max-w-md"
          />
        </div>
      </Panel>

      <Panel
        title="Tools it may use"
        description="What the AI is allowed to do during a call. Each use is recorded; tools run once live calls arrive."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {tools.map((tool) => (
            <label
              key={tool.name}
              className="flex items-start gap-2 rounded-[12px] border border-line px-3 py-2.5 text-sm"
            >
              <input
                type="checkbox"
                className="mt-1"
                checked={draft.tools.includes(tool.name)}
                onChange={(e) =>
                  set(
                    'tools',
                    e.target.checked
                      ? [...draft.tools, tool.name]
                      : draft.tools.filter((t) => t !== tool.name),
                  )
                }
              />
              <span>
                <span className="font-semibold text-ink">{tool.label}</span>
                <span className="block text-muted">{tool.description}</span>
              </span>
            </label>
          ))}
        </div>
      </Panel>
    </fieldset>
  );
}
