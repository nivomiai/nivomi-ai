import type { ProductPreview as Preview } from '@/lib/site/coming-soon';
import { cx } from '@/lib/site/cx';
import { Icon, StatusBadge } from '../primitives';

function ChatPreview({ preview }: { readonly preview: Extract<Preview, { kind: 'chat' }> }) {
  return (
    <ol className="grid gap-3 p-5" aria-label={`Example ${preview.channel} conversation`}>
      {preview.messages.map((message, index) =>
        message.from === 'system' ? (
          <li
            key={index}
            className="mx-auto inline-flex items-center gap-2 rounded-full bg-soft px-3 py-1.5 text-xs font-semibold text-muted"
          >
            <Icon name="i-check-c" className="size-3.5" />
            {message.text}
          </li>
        ) : (
          <li
            key={index}
            className={cx(
              'max-w-[85%] rounded-[16px] px-4 py-2.5 text-sm',
              message.from === 'ai'
                ? 'rounded-tl-sm border border-line bg-soft text-ink-2'
                : 'ml-auto rounded-tr-sm bg-[image:var(--nv-grad)] text-white',
            )}
          >
            <span className="mb-0.5 block text-[11px] font-bold opacity-70">
              {message.from === 'ai' ? 'Nivomi AI' : 'Customer'}
            </span>
            {message.text}
          </li>
        ),
      )}
    </ol>
  );
}

function PipelinePreview({
  preview,
}: {
  readonly preview: Extract<Preview, { kind: 'pipeline' }>;
}) {
  return (
    <div className="p-5">
      <p className="text-sm font-semibold text-ink">{preview.title}</p>
      <ol className="mt-4 grid gap-2" aria-label={preview.title}>
        {preview.steps.map((step, index) => (
          <li key={step.label} className="flex items-stretch gap-3">
            <span className="flex flex-col items-center">
              <span className="inline-grid size-8 place-items-center rounded-full bg-soon-soft font-mono text-xs font-bold text-soon">
                {index + 1}
              </span>
              {index < preview.steps.length - 1 && <span className="w-px flex-1 bg-line" />}
            </span>
            <span className="mb-2 flex-1 rounded-[12px] border border-line bg-surface px-4 py-2.5">
              <span className="block text-xs font-bold tracking-[0.08em] text-muted uppercase">
                {step.label}
              </span>
              <span className="block text-sm text-ink">{step.detail}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function AnalyticsPreview({
  preview,
}: {
  readonly preview: Extract<Preview, { kind: 'analytics' }>;
}) {
  const max = Math.max(...preview.bars.map((bar) => bar.value));
  return (
    <div className="p-5">
      <p className="text-xs font-bold tracking-[0.08em] text-muted uppercase">Ask Nivomi</p>
      <p className="mt-2 flex items-center gap-2 rounded-[12px] border border-line bg-surface px-4 py-3 text-sm text-ink">
        <Icon name="i-spark" className="size-4 text-accent" />“{preview.question}”
      </p>
      <p className="mt-4 text-sm text-ink-2">{preview.answer}</p>
      <figure className="mt-4">
        <ul className="grid gap-2.5" aria-label="Example chart with illustrative values">
          {preview.bars.map((bar) => (
            <li
              key={bar.label}
              className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3 text-xs"
            >
              <span className="truncate text-muted">{bar.label}</span>
              <span className="h-3 rounded-full bg-line-2">
                <span
                  className="block h-3 rounded-full bg-[image:var(--nv-grad)]"
                  style={{ width: `${Math.round((bar.value / max) * 100)}%` }}
                />
              </span>
            </li>
          ))}
        </ul>
        <figcaption className="mt-3 text-[11px] text-muted">
          Example data for illustration — not real customer results.
        </figcaption>
      </figure>
    </div>
  );
}

export function ProductPreview({
  title,
  preview,
}: {
  readonly title: string;
  readonly preview: Preview;
}) {
  const channel =
    preview.kind === 'chat'
      ? preview.channel
      : preview.kind === 'analytics'
        ? 'Analytics'
        : 'Workflow';
  return (
    <figure
      className="card-nv overflow-hidden shadow-lg"
      aria-label={`${title} preview (illustration)`}
    >
      <div className="flex items-center gap-3 border-b border-line bg-soft px-5 py-3.5">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-line" />
          <span className="size-2.5 rounded-full bg-line" />
          <span className="size-2.5 rounded-full bg-line" />
        </span>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
          {title} · {channel}
        </p>
        <StatusBadge variant="preview" />
      </div>
      {preview.kind === 'chat' && <ChatPreview preview={preview} />}
      {preview.kind === 'pipeline' && <PipelinePreview preview={preview} />}
      {preview.kind === 'analytics' && <AnalyticsPreview preview={preview} />}
      <figcaption className="flex items-center justify-between gap-3 border-t border-line bg-soft px-5 py-3 text-xs text-muted">
        <span>Product concept — not a working feature.</span>
        <StatusBadge variant="soon" />
      </figcaption>
    </figure>
  );
}
