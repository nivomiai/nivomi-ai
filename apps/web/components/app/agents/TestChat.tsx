'use client';

import { useState, type FormEvent } from 'react';
import type { AgentDetail, ConversationOutcome, TestSession } from '@/lib/api/types';
import { api } from '@/lib/app/api';
import { useSubmit } from '@/lib/app/use-submit';
import { cx } from '@/lib/site/cx';
import { Badge, Field, FormAlert, Notice, Panel, SelectField } from '../ui';

const OUTCOME_LABELS: Record<ConversationOutcome, string> = {
  INTERESTED: 'Interested',
  NOT_INTERESTED: 'Not interested',
  CALLBACK_REQUESTED: 'Callback requested',
  COMPLETED: 'Completed',
  OPTED_OUT: 'Opted out',
  TRANSFERRED: 'Transferred to a human',
  INCOMPLETE: 'Incomplete',
};

/**
 * Dograh-style "Test Chat": type what the person would say and watch the agent follow its
 * workflow. Tests never call anyone and are excluded from analytics.
 */
export function TestChat({
  agentId,
  versions,
  dirty,
  canTest,
}: {
  readonly agentId: string;
  readonly versions: AgentDetail['versions'];
  readonly dirty: boolean;
  readonly canTest: boolean;
}) {
  const [target, setTarget] = useState('draft');
  const [session, setSession] = useState<TestSession | null>(null);
  const [text, setText] = useState('');
  const start = useSubmit();
  const send = useSubmit();

  if (!canTest) {
    return <Notice tone="info">Testing an agent needs the permission to manage agents.</Notice>;
  }

  const onStart = () =>
    void start.run(async () => {
      setSession(
        await api.post<TestSession>(`/agents/${agentId}/test-sessions`, {
          versionId: target === 'draft' ? null : target,
        }),
      );
    });

  const onSend = async (event: FormEvent) => {
    event.preventDefault();
    if (!session || !text.trim()) return;
    const ok = await send.run(async () => {
      setSession(
        await api.post<TestSession>(`/agents/${agentId}/test-sessions/${session.id}/turns`, {
          turn: session.turn + 1,
          text,
        }),
      );
    });
    if (ok) setText('');
  };

  return (
    <Panel
      title="Test chat"
      description="Type what the person would say. The AI part uses a simulated model until an AI provider is connected."
    >
      <div className="grid gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <SelectField
            id="test-target"
            label="Test"
            value={target}
            onChange={setTarget}
            options={[
              { value: 'draft', label: 'The saved draft' },
              ...versions.map((v) => ({ value: v.id, label: `Version ${v.version}` })),
            ]}
            className="min-w-56"
          />
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={start.pending}
            onClick={onStart}
          >
            {session ? 'Start over' : 'Start test chat'}
          </button>
        </div>
        {dirty && target === 'draft' ? (
          <Notice tone="warn">You have unsaved changes; the test uses the last saved draft.</Notice>
        ) : null}
        <FormAlert message={start.error ?? send.error} />

        {session ? (
          <>
            <ol
              className="grid max-h-[460px] gap-2 overflow-y-auto rounded-[14px] border border-line bg-soft p-4"
              aria-live="polite"
              aria-label="Conversation"
            >
              {session.transcript.map((u, i) => (
                <li
                  key={i}
                  className={cx(
                    'max-w-[80%] rounded-[14px] px-3.5 py-2 text-sm',
                    u.role === 'agent' ? 'bg-card text-ink' : 'ml-auto bg-accent-soft text-ink',
                  )}
                >
                  <span className="sr-only">{u.role === 'agent' ? 'Agent: ' : 'You: '}</span>
                  {u.text}
                </li>
              ))}
            </ol>
            {session.ended ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge tone="live">
                  Call ended · {session.outcome ? OUTCOME_LABELS[session.outcome] : '—'}
                </Badge>
                <Badge tone={session.qualification === 'QUALIFIED' ? 'live' : 'neutral'}>
                  {session.qualification.replace('_', ' ').toLowerCase()}
                </Badge>
              </div>
            ) : (
              <form
                onSubmit={(e) => void onSend(e)}
                className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
              >
                <Field
                  id="test-message"
                  label="The person says"
                  maxLength={1000}
                  autoComplete="off"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={send.pending || !text.trim()}
                >
                  {send.pending ? 'Sending…' : 'Send'}
                </button>
              </form>
            )}
            {Object.keys(session.answers).length > 0 ? (
              <dl className="grid gap-1 text-sm">
                <dt className="font-semibold text-ink">Answers captured</dt>
                {Object.entries(session.answers).map(([key, value]) => (
                  <dd key={key} className="text-ink-2">
                    {key}: {value === null ? '—' : String(value)}
                  </dd>
                ))}
              </dl>
            ) : null}
          </>
        ) : null}
      </div>
    </Panel>
  );
}
