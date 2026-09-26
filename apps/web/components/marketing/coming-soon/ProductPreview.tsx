import type { ReactNode } from 'react';
import type { ProductPreview as Preview, PreviewMessage } from '@/lib/site/coming-soon';
import { cx } from '@/lib/site/cx';
import { Icon, StatusBadge } from '../primitives';

type Of<K extends Preview['kind']> = Extract<Preview, { kind: K }>;

/** Shared frame: every preview is visibly labelled as an illustration of a future product. */
function PreviewFrame({
  label,
  children,
  phone = false,
  extra,
}: {
  readonly label: string;
  readonly children: ReactNode;
  readonly phone?: boolean;
  /** Supporting card shown under the mockup. */
  readonly extra?: ReactNode;
}) {
  return (
    <figure
      aria-label={`${label} (illustration of a product that is coming soon)`}
      className="relative"
    >
      <div aria-hidden="true" className="cs-glow absolute -inset-8 -z-10 rounded-[48px] blur-2xl" />
      <div className="mb-3 flex items-center justify-between gap-3">
        <StatusBadge variant="preview" />
        <StatusBadge variant="soon" />
      </div>
      {phone ? (
        <div className="mx-auto w-full max-w-[340px] rounded-[44px] border border-line bg-card p-2.5 shadow-lg">
          <div className="overflow-hidden rounded-[36px] border border-line-2 bg-surface">
            <div aria-hidden="true" className="mx-auto mt-2 h-5 w-24 rounded-full bg-line" />
            {children}
          </div>
        </div>
      ) : (
        <div className="card-nv overflow-hidden shadow-lg">{children}</div>
      )}
      {extra}
      <figcaption className="mt-3 text-center text-xs text-muted">
        Product concept with example content — not a working feature.
      </figcaption>
    </figure>
  );
}

function Bubble({
  message,
  tone,
}: {
  readonly message: PreviewMessage;
  readonly tone: 'chat' | 'sms';
}) {
  if (message.from === 'system') {
    return (
      <li className="mx-auto inline-flex items-center gap-1.5 rounded-full bg-soft px-3 py-1 text-[11px] font-semibold text-muted">
        <Icon name="i-check-c" className="size-3.5 cs-text" />
        {message.text}
      </li>
    );
  }
  const fromBusiness = message.from === 'ai';
  return (
    <li
      className={cx(
        'max-w-[82%] rounded-[18px] px-3.5 py-2 text-[13px] leading-snug shadow-sm',
        fromBusiness
          ? tone === 'chat'
            ? 'cs-bg ml-auto rounded-br-md text-ink'
            : 'ml-auto rounded-br-md bg-[image:var(--nv-grad)] text-white'
          : 'rounded-bl-md border border-line bg-card text-ink',
      )}
    >
      {message.text}
    </li>
  );
}

function WhatsAppPreview({ preview }: { readonly preview: Of<'whatsapp'> }) {
  return (
    <PreviewFrame label="WhatsApp AI Manager chat" phone>
      <div className="cs-solid mt-2 flex items-center gap-3 px-4 py-3">
        <span className="inline-grid size-9 place-items-center rounded-full bg-white/25 text-sm font-bold">
          {preview.business.slice(0, 1)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">{preview.business}</span>
          <span className="block text-[11px] opacity-85">Business account · AI assisted</span>
        </span>
        <Icon name="i-phone" className="size-4" />
      </div>
      <ol className="grid gap-2 bg-soft px-3 py-4" aria-label="Example conversation">
        {preview.messages.map((message, index) => (
          <Bubble key={index} message={message} tone="chat" />
        ))}
      </ol>
      <div className="flex flex-wrap gap-1.5 border-t border-line bg-surface px-3 py-3">
        {preview.quickReplies.map((reply) => (
          <span
            key={reply}
            className="cs-border cs-text rounded-full border px-3 py-1 text-[12px] font-semibold"
          >
            {reply}
          </span>
        ))}
      </div>
    </PreviewFrame>
  );
}

function SmsPreview({ preview }: { readonly preview: Of<'sms'> }) {
  return (
    <PreviewFrame
      label="SMS automation thread"
      phone
      extra={
        <div className="card-nv mx-auto mt-4 flex max-w-[340px] items-start gap-3 p-4 shadow-md">
          <span className="cs-bg cs-text inline-grid size-9 shrink-0 place-items-center rounded-[10px]">
            <Icon name="i-zap" className="size-4" />
          </span>
          <span>
            <span className="block text-[11px] font-bold tracking-[0.08em] text-muted uppercase">
              Trigger
            </span>
            <span className="block text-sm font-semibold text-ink">{preview.trigger.when}</span>
            <span className="mt-0.5 block text-xs text-muted">{preview.trigger.action}</span>
          </span>
        </div>
      }
    >
      <div className="mt-2 border-b border-line px-4 py-3 text-center">
        <span className="cs-bg cs-text mx-auto inline-grid size-10 place-items-center rounded-full">
          <Icon name="i-sms" className="size-5" />
        </span>
        <p className="mt-1.5 text-sm font-bold text-ink">{preview.sender}</p>
        <p className="text-[11px] text-muted">Registered sender · Example</p>
      </div>
      <ol className="grid gap-2 px-3 py-4" aria-label="Example SMS thread">
        {preview.messages.map((message, index) => (
          <Bubble key={index} message={message} tone="sms" />
        ))}
      </ol>
    </PreviewFrame>
  );
}

function OperationsPreview({ preview }: { readonly preview: Of<'operations'> }) {
  return (
    <PreviewFrame label="Operations AI task board">
      <div className="flex items-center gap-2 border-b border-line bg-soft px-5 py-3.5">
        <Icon name="i-flow" className="size-4 cs-text" />
        <p className="text-sm font-semibold text-ink">Operations board · Example</p>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-3">
        {preview.columns.map((column) => (
          <div key={column.title} className="rounded-[14px] bg-soft p-2.5">
            <p className="px-1 pb-2 text-[11px] font-bold tracking-[0.08em] text-muted uppercase">
              {column.title}
            </p>
            <ul className="grid gap-2">
              {column.cards.map((card) => (
                <li
                  key={card.title}
                  className={cx(
                    'rounded-[10px] border bg-card px-3 py-2.5 shadow-sm',
                    card.tone === 'approval' ? 'cs-border border-2' : 'border-line',
                  )}
                >
                  <p className="text-[13px] font-semibold text-ink">{card.title}</p>
                  <p className="mt-0.5 text-[11px] text-muted">{card.detail}</p>
                  {card.tone === 'approval' && (
                    <span className="cs-bg cs-text mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase">
                      <Icon name="i-user" className="size-3" /> Approval required
                    </span>
                  )}
                  {card.tone === 'done' && (
                    <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-live-soft px-2 py-0.5 text-[10px] font-bold text-live uppercase">
                      <Icon name="i-check" className="size-3" /> Verified
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </PreviewFrame>
  );
}

function Sparkline({ values }: { readonly values: readonly number[] }) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const points = values
    .map(
      (v, i) =>
        `${(i / (values.length - 1)) * 100},${30 - ((v - min) / (max - min || 1)) * 26 - 2}`,
    )
    .join(' ');
  return (
    <svg
      viewBox="0 0 100 30"
      preserveAspectRatio="none"
      aria-hidden="true"
      className="h-10 w-full cs-text"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function AnalyticsPreview({ preview }: { readonly preview: Of<'analytics'> }) {
  const max = Math.max(...preview.bars.map((bar) => bar.value));
  return (
    <PreviewFrame label="Analytics AI dashboard">
      <div className="border-b border-line bg-soft px-5 py-3.5">
        <p className="text-[11px] font-bold tracking-[0.08em] text-muted uppercase">Ask Nivomi</p>
        <p className="mt-2 flex items-center gap-2 rounded-[12px] border border-line bg-surface px-3.5 py-2.5 text-[13px] text-ink">
          <Icon name="i-spark" className="size-4 cs-text" />“{preview.question}”
        </p>
      </div>
      <div className="grid gap-4 p-5">
        <ul className="grid grid-cols-3 gap-2" aria-label="Example figures">
          {preview.kpis.map((kpi) => (
            <li
              key={kpi.label}
              className="rounded-[12px] border border-line bg-surface px-3 py-2.5"
            >
              <span className="block text-[11px] text-muted">{kpi.label}</span>
              <span className="block text-lg font-extrabold tracking-tight text-ink">
                {kpi.value}
              </span>
            </li>
          ))}
        </ul>
        <p className="cs-bg rounded-[12px] px-3.5 py-2.5 text-[13px] text-ink-2">
          <span className="font-semibold text-ink">Example answer: </span>
          {preview.answer}
        </p>
        <ul className="grid gap-2" aria-label="Example chart">
          {preview.bars.map((bar) => (
            <li
              key={bar.label}
              className="grid grid-cols-[minmax(0,8.5rem)_1fr] items-center gap-3 text-[11px]"
            >
              <span className="truncate text-muted">{bar.label}</span>
              <span className="h-2.5 rounded-full bg-line-2">
                <span
                  className="block h-2.5 rounded-full bg-[var(--cs)]"
                  style={{ width: `${Math.round((bar.value / max) * 100)}%` }}
                />
              </span>
            </li>
          ))}
        </ul>
        <div>
          <p className="text-[11px] text-muted">Qualified leads per day</p>
          <Sparkline values={preview.trend} />
        </div>
        <p className="text-[11px] text-muted">
          All figures are example data — not real customer results.
        </p>
      </div>
    </PreviewFrame>
  );
}

const TICKET_STATUS = {
  routed: { label: 'Routed', className: 'cs-bg cs-text' },
  captured: { label: 'Captured', className: 'bg-live-soft text-live' },
  'needs-staff': { label: 'Needs staff', className: 'bg-warn-soft text-warn' },
} as const;

function HotelPreview({ preview }: { readonly preview: Of<'hotel'> }) {
  return (
    <PreviewFrame label="Hotel AI front-desk console">
      <div className="flex items-center gap-3 border-b border-line bg-soft px-5 py-4">
        <span className="cs-solid inline-grid size-10 place-items-center rounded-full">
          <Icon name="i-phone" className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-ink">{preview.call.title}</span>
          <span className="block truncate text-xs text-muted">{preview.call.detail}</span>
        </span>
        <span className="rounded-full border border-line px-2.5 py-1 font-mono text-[11px] text-muted">
          {preview.call.time}
        </span>
      </div>
      <div className="p-5">
        <p className="text-[11px] font-bold tracking-[0.08em] text-muted uppercase">
          Guest requests · Example
        </p>
        <ul className="mt-3 grid gap-2">
          {preview.tickets.map((ticket) => (
            <li
              key={ticket.request}
              className="flex items-center gap-3 rounded-[12px] border border-line bg-surface px-3.5 py-3"
            >
              <Icon name="i-bed" className="size-4 cs-text" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-ink">
                  {ticket.request}
                </span>
                <span className="block text-[11px] text-muted">{ticket.team}</span>
              </span>
              <span
                className={cx(
                  'rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap uppercase',
                  TICKET_STATUS[ticket.status].className,
                )}
              >
                {TICKET_STATUS[ticket.status].label}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </PreviewFrame>
  );
}

const STOP_STYLE = {
  done: 'border-transparent cs-solid',
  issue: 'border-warn/40 bg-warn-soft text-warn',
  current: 'cs-border cs-bg cs-text border-2',
  next: 'border-line bg-surface text-muted',
} as const;

function LogisticsPreview({ preview }: { readonly preview: Of<'logistics'> }) {
  return (
    <PreviewFrame label="Logistics AI shipment tracker">
      <div className="flex items-center gap-3 border-b border-line bg-soft px-5 py-3.5">
        <Icon name="i-truck" className="size-5 cs-text" />
        <p className="flex-1 text-sm font-semibold text-ink">Shipment {preview.trackingId}</p>
        <span className="text-[11px] text-muted">Example</span>
      </div>
      <ol className="p-5" aria-label="Example shipment timeline">
        {preview.stops.map((stop, index) => (
          <li key={stop.label} className="flex gap-3">
            <span className="flex flex-col items-center">
              <span
                className={cx(
                  'inline-grid size-7 place-items-center rounded-full border text-[11px] font-bold',
                  STOP_STYLE[stop.state],
                )}
              >
                {stop.state === 'issue' ? (
                  '!'
                ) : stop.state === 'next' ? (
                  index + 1
                ) : (
                  <Icon name="i-check" className="size-3.5" />
                )}
              </span>
              {index < preview.stops.length - 1 && <span className="w-px flex-1 bg-line" />}
            </span>
            <span className="pb-4">
              <span
                className={cx(
                  'block text-[13px] font-semibold',
                  stop.state === 'next' ? 'text-muted' : 'text-ink',
                )}
              >
                {stop.label}
              </span>
              <span className="block text-[11px] text-muted">{stop.detail}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="cs-bg mx-5 mb-5 flex items-center gap-2 rounded-[12px] px-3.5 py-2.5 text-[12px] font-semibold text-ink">
        <Icon name="i-phone" className="size-4 cs-text" />
        {preview.notice}
      </p>
    </PreviewFrame>
  );
}

/** Product-specific mockup for a Coming Soon page. */
export function ProductPreview({ preview }: { readonly preview: Preview }) {
  switch (preview.kind) {
    case 'whatsapp':
      return <WhatsAppPreview preview={preview} />;
    case 'sms':
      return <SmsPreview preview={preview} />;
    case 'operations':
      return <OperationsPreview preview={preview} />;
    case 'analytics':
      return <AnalyticsPreview preview={preview} />;
    case 'hotel':
      return <HotelPreview preview={preview} />;
    case 'logistics':
      return <LogisticsPreview preview={preview} />;
  }
}
