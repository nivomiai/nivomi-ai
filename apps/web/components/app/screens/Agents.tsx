'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import {
  LANGUAGE_LABELS,
  type AgentCallCategory,
  type AgentStatus,
  type AgentSummary,
  type AgentTool,
} from '@/lib/api/types';
import { api } from '@/lib/app/api';
import { formatDateTime } from '@/lib/app/format';
import { useSession } from '@/lib/app/session';
import { useResource } from '@/lib/app/use-resource';
import { useSubmit } from '@/lib/app/use-submit';
import {
  Badge,
  EmptyState,
  ErrorBlock,
  Field,
  FormAlert,
  LoadingBlock,
  PageHeader,
  Panel,
  SelectField,
} from '../ui';

export const AGENT_STATUS: Record<
  AgentStatus,
  { label: string; tone: 'live' | 'accent' | 'neutral' }
> = {
  ACTIVE: { label: 'Published', tone: 'live' },
  DRAFT: { label: 'Draft', tone: 'accent' },
  ARCHIVED: { label: 'Archived', tone: 'neutral' },
};

/** PRD FR-26: AI Agents — what the AI says, separated from what it is allowed to do. */
export function Agents() {
  const { can } = useSession();
  const agents = useResource<{ items: AgentSummary[] }>('/agents');
  const tools = useResource<{ items: AgentTool[] }>('/agents/tools');
  const toolLabel = (name: string) => tools.data?.items.find((t) => t.name === name)?.label ?? name;

  return (
    <div className="grid gap-8">
      <PageHeader
        title="AI Agents"
        description="Design the conversation, test it in the browser, then publish a version for campaigns to use."
      />
      {can('agents.manage') ? <CreateAgent /> : null}
      {agents.error && !agents.data ? (
        <ErrorBlock message={agents.error} onRetry={agents.reload} />
      ) : !agents.data ? (
        <LoadingBlock label="Loading agents" />
      ) : agents.data.items.length === 0 ? (
        <Panel>
          <EmptyState icon="i-spark" title="No AI agents yet">
            Create one to design its conversation. Nothing calls anyone until a campaign uses a
            published version.
          </EmptyState>
        </Panel>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {agents.data.items.map((agent) => (
            <article key={agent.id} className="card-nv flex flex-col gap-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg tracking-[-0.02em] text-ink">{agent.name}</h2>
                  <p className="text-sm text-muted">
                    {agent.callCategory === 'PROMOTIONAL' ? 'Sales (promotional)' : 'Service'} calls
                    {agent.personaName ? ` · speaks as ${agent.personaName}` : ''}
                  </p>
                </div>
                <Badge tone={AGENT_STATUS[agent.status].tone}>
                  {AGENT_STATUS[agent.status].label}
                  {agent.latestVersion ? ` · v${agent.latestVersion}` : ''}
                </Badge>
              </div>
              <p className="text-sm text-ink-2">
                Language:{' '}
                {agent.primaryLanguage
                  ? [agent.primaryLanguage, ...agent.otherLanguages]
                      .map((l) => LANGUAGE_LABELS[l])
                      .join(' / ')
                  : '—'}
              </p>
              <div>
                <p className="text-xs font-bold tracking-[0.08em] text-muted uppercase">Tools</p>
                <p className="mt-1 text-sm text-ink-2">
                  {agent.tools.length
                    ? agent.tools.map((t) => `✓ ${toolLabel(t)}`).join(' · ')
                    : 'None (talks only)'}
                </p>
              </div>
              <div className="mt-auto flex items-center justify-between gap-3">
                <span className="text-[13px] text-muted">
                  Updated {formatDateTime(agent.updatedAt)}
                </span>
                <Link href={`/app/agents/${agent.id}`} className="btn btn-secondary btn-sm">
                  {can('agents.manage') ? 'Configure' : 'View'}
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateAgent() {
  const router = useRouter();
  const submit = useSubmit();
  const [name, setName] = useState('');
  const [callCategory, setCallCategory] = useState<AgentCallCategory>('PROMOTIONAL');
  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const created: { id: string | null } = { id: null };
    const ok = await submit.run(async () => {
      created.id = (await api.post<{ id: string }>('/agents', { name, callCategory })).id;
    });
    if (ok && created.id) router.push(`/app/agents/${created.id}`);
  };
  return (
    <Panel
      title="Create an agent"
      description="It starts from a short, valid conversation you can reshape."
    >
      <form
        onSubmit={(e) => void onSubmit(e)}
        className="grid gap-4 sm:grid-cols-[1.4fr_1fr_auto] sm:items-end"
      >
        <div className="sm:col-span-3">
          <FormAlert message={submit.error} />
        </div>
        <Field
          id="agent-name"
          label="Agent name"
          required
          maxLength={120}
          placeholder="Site-visit assistant"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <SelectField
          id="agent-category"
          label="Call type"
          value={callCategory}
          onChange={(v) => setCallCategory(v as AgentCallCategory)}
          options={[
            { value: 'PROMOTIONAL', label: 'Sales (promotional)' },
            { value: 'SERVICE', label: 'Service' },
          ]}
        />
        <button type="submit" className="btn btn-primary" disabled={submit.pending}>
          {submit.pending ? 'Creating…' : 'Create agent'}
        </button>
      </form>
    </Panel>
  );
}
