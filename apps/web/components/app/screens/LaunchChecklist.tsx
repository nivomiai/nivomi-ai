'use client';

import type { IntegrationCheck } from '@/lib/api/types';
import { useSession } from '@/lib/app/session';
import { useResource } from '@/lib/app/use-resource';
import { cx } from '@/lib/site/cx';
import { Badge, EmptyState, ErrorBlock, LoadingBlock, Notice, PageHeader, Panel } from '../ui';

const STATUS_LABEL: Record<IntegrationCheck['status'], string> = {
  ready: 'Ready',
  simulated: 'Simulated',
  missing: 'Not configured',
};

const STATUS_TONE: Record<IntegrationCheck['status'], 'live' | 'warn' | 'accent'> = {
  ready: 'live',
  simulated: 'accent',
  missing: 'warn',
};

/**
 * Super Admin "What do I still need to go live?" page. Reads the API's own view of its
 * configuration — never asks the browser to inspect secrets. A green row means the slot is
 * populated AND the service is in real mode; "Simulated" means a stand-in is active.
 */
export function LaunchChecklist() {
  const { me } = useSession();
  const health = useResource<{ items: IntegrationCheck[] }>(
    me?.user.isSuperAdmin ? '/platform/integrations/health' : null,
  );

  if (!me?.user.isSuperAdmin) {
    return (
      <div className="grid gap-8">
        <PageHeader title="Launch checklist" />
        <EmptyState icon="i-shield" title="Super Admin only">
          <p>Only a platform Super Admin may open this section.</p>
        </EmptyState>
      </div>
    );
  }

  const items = health.data?.items ?? [];
  const missing = items.filter((i) => i.status === 'missing' && i.productionBlocker).length;
  const simulated = items.filter((i) => i.status === 'simulated' && i.productionBlocker).length;
  const ready = items.filter((i) => i.status === 'ready').length;

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Launch checklist"
        description="What the API has configured right now. Fix the red rows before taking real traffic; the amber rows are stand-ins that production refuses to boot with."
      />

      {health.error ? (
        <ErrorBlock message={health.error} onRetry={health.reload} />
      ) : health.loading && !health.data ? (
        <LoadingBlock label="Reading API health" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <SummaryTile label="Ready" value={ready} tone="live" />
            <SummaryTile label="Simulated" value={simulated} tone="accent" />
            <SummaryTile label="Not configured" value={missing} tone="warn" />
          </div>

          {missing === 0 && simulated === 0 ? (
            <Notice tone="success">
              Every production blocker is set. You can safely accept real traffic.
            </Notice>
          ) : (
            <Notice tone="info">
              Nivomi stays usable in simulated mode locally. The red / amber rows are a to-do list
              for the deploy phase — the API refuses to boot in production with any of them.
            </Notice>
          )}

          <div className="grid gap-3">
            {items.map((item) => (
              <IntegrationRow key={item.key} item={item} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  readonly label: string;
  readonly value: number;
  readonly tone: 'live' | 'accent' | 'warn';
}) {
  return (
    <div
      className={cx(
        'rounded-[14px] border p-4',
        tone === 'live' && 'border-live/25 bg-live-soft/40',
        tone === 'accent' && 'border-accent-tint bg-accent-soft/60',
        tone === 'warn' && 'border-warn/25 bg-warn-soft/50',
      )}
    >
      <p className="text-[11px] font-bold tracking-[0.12em] text-muted uppercase">{label}</p>
      <p
        className={cx(
          'mt-1 text-[26px] font-extrabold',
          tone === 'live' && 'text-live',
          tone === 'accent' && 'text-accent',
          tone === 'warn' && 'text-warn',
        )}
      >
        {value}
      </p>
    </div>
  );
}

function IntegrationRow({ item }: { readonly item: IntegrationCheck }) {
  return (
    <Panel
      title={item.label}
      action={
        <Badge tone={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status]}</Badge>
      }
    >
      <p className="text-[14px] text-ink-2">{item.summary}</p>
      {item.missing.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {item.missing.map((env) => (
            <code
              key={env}
              className="rounded-[6px] border border-warn/30 bg-warn-soft/60 px-2 py-1 text-[12px] font-semibold text-warn"
            >
              {env}
            </code>
          ))}
        </div>
      ) : null}
      {item.docs ? (
        <p className="mt-3 text-[13px]">
          <a
            href={item.docs}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-accent hover:underline"
          >
            Vendor docs →
          </a>
        </p>
      ) : null}
    </Panel>
  );
}
