import Image from 'next/image';
import type { CSSProperties } from 'react';
import type { IconName } from '@/lib/site/icons';
import { Icon, StatusBadge } from '../primitives';
import { TrackedLink } from '../tracking';

const highlights = [
  'Outbound and inbound AI calls',
  'Human handoff when needed',
  'CRM sync, optional',
  'Six Indian languages',
];

interface FlowRow {
  readonly icon: IconName;
  readonly label: string;
  readonly detail: string;
}

const flowBefore: readonly FlowRow[] = [
  { icon: 'i-users', label: 'Lead', detail: 'From Excel, your CRM or the API' },
  { icon: 'i-phone', label: 'AI voice call', detail: 'In the lead’s language' },
  { icon: 'i-target', label: 'Qualification', detail: 'Your questions, captured as data' },
];

const flowAfter: readonly FlowRow[] = [
  { icon: 'i-user', label: 'Human escalation if required', detail: 'Live transfer or callback' },
  { icon: 'i-chat', label: 'Transcript + AI summary', detail: 'For every connected call' },
  { icon: 'i-refresh', label: 'CRM', detail: 'Outcome and notes synced' },
  { icon: 'i-chart', label: 'Analytics', detail: 'Campaign results and usage' },
];

const STEP = 1.3;
const CYCLE = (flowBefore.length + 1 + flowAfter.length) * STEP;

function stepStyle(index: number): CSSProperties {
  return { '--nv-cycle': `${CYCLE}s`, '--nv-delay': `${index * STEP}s` } as CSSProperties;
}

function Row({ row, index }: { readonly row: FlowRow; readonly index: number }) {
  return (
    <li
      className="nv-step-anim flex items-center gap-3 rounded-[14px] border border-line bg-card px-3.5 py-2.5 shadow-sm"
      style={stepStyle(index)}
    >
      <span className="icon-tile size-9 rounded-[10px]">
        <Icon name={row.icon} className="size-[18px]" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{row.label}</span>
        <span className="block truncate text-xs text-muted">{row.detail}</span>
      </span>
    </li>
  );
}

function HeroVisual() {
  return (
    <figure className="relative mx-auto w-full max-w-[520px]">
      <div
        aria-hidden="true"
        className="absolute -inset-6 -z-10 rounded-[40px] bg-[radial-gradient(closest-side,rgba(204,0,126,0.18),transparent)] blur-2xl"
      />
      <div className="card-nv overflow-hidden shadow-lg">
        <div className="flex items-center gap-3 border-b border-line bg-soft px-5 py-4">
          <Image
            src="/brand/ai-agent.webp"
            alt=""
            width={48}
            height={48}
            priority
            className="size-12 rounded-full border border-line bg-white object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-ink">Nivomi AI voice agent</p>
            <p className="text-xs text-muted">Outbound call · Example workflow</p>
          </div>
          <StatusBadge variant="preview" label="Illustration" />
        </div>

        <ol className="grid gap-2 p-4 sm:p-5" aria-label="Example call workflow">
          {flowBefore.map((row, i) => (
            <Row key={row.label} row={row} index={i} />
          ))}
          <li
            className="nv-step-anim rounded-[14px] border border-line bg-card p-3 shadow-sm"
            style={stepStyle(flowBefore.length)}
          >
            <p className="px-0.5 text-xs font-bold tracking-[0.08em] text-muted uppercase">
              Interested?
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-[10px] border border-line-2 bg-soft px-3 py-2">
                <span className="font-semibold text-ink">No</span>
                <span className="block text-muted">Status updated, follow-up set</span>
              </div>
              <div className="rounded-[10px] border border-accent-tint bg-accent-soft px-3 py-2">
                <span className="font-semibold text-accent">Yes</span>
                <span className="block text-ink-2">Appointment booked</span>
              </div>
            </div>
          </li>
          {flowAfter.map((row, i) => (
            <Row key={row.label} row={row} index={flowBefore.length + 1 + i} />
          ))}
        </ol>
      </div>
      <figcaption className="mt-3 text-center text-xs text-muted">
        Illustration of the MVP call workflow.
      </figcaption>
    </figure>
  );
}

export function Hero() {
  return (
    <section id="top" aria-labelledby="hero-title" className="hero-glow relative overflow-hidden">
      <div
        aria-hidden="true"
        className="dotgrid absolute inset-0 -z-10 opacity-40 [mask-image:linear-gradient(to_bottom,black,transparent_70%)]"
      />
      <div className="container-nv grid items-center gap-14 pt-32 pb-20 md:pt-40 lg:grid-cols-[1.05fr_1fr] lg:pb-28">
        <div>
          <p className="inline-flex flex-wrap items-center gap-2.5 rounded-full border border-line bg-card/70 py-1.5 pr-4 pl-1.5 text-[13px] font-semibold text-ink-2 shadow-sm backdrop-blur">
            <StatusBadge variant="mvp" />
            AI voice automation for sales teams
          </p>
          <h1
            id="hero-title"
            className="mt-6 text-[clamp(40px,5.4vw,72px)] leading-[1.02] tracking-[-0.045em] text-ink"
          >
            AI voice automation <span className="grad-text">for sales teams.</span>
          </h1>
          <p className="lede mt-6 max-w-xl">
            Nivomi calls your leads in their language, qualifies them with your questions, books
            appointments and brings your team in when a person is needed. Every connected call ends
            with a transcript, a summary and an update in your CRM.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <TrackedLink
              href="#get-started"
              event="hero_cta_clicked"
              props={{ cta: 'get_started' }}
              className="btn btn-primary"
            >
              Get started
              <Icon name="i-arrow" className="size-4" />
            </TrackedLink>
            <TrackedLink
              href="#contact"
              event="demo_cta_clicked"
              props={{ placement: 'hero' }}
              className="btn btn-secondary"
            >
              Book a demo
            </TrackedLink>
          </div>
          <ul className="mt-9 grid gap-x-6 gap-y-2.5 text-sm text-ink-2 sm:grid-cols-2">
            {highlights.map((item) => (
              <li key={item} className="flex items-center gap-2.5">
                <span className="inline-grid size-5 place-items-center rounded-full bg-accent-soft text-accent">
                  <Icon name="i-check" className="size-3.5" />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <HeroVisual />
      </div>
    </section>
  );
}
