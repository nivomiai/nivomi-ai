import Link from 'next/link';
import { type ComingSoonProduct, comingSoonProducts } from '@/lib/site/coming-soon';
import { cx } from '@/lib/site/cx';
import { LeadForm } from '../LeadForm';
import { Icon, Section, StatusBadge } from '../primitives';
import { TrackOnView, TrackedLink } from '../tracking';
import { ProductPreview } from './ProductPreview';

function ComingSoonHero({ product }: { readonly product: ComingSoonProduct }) {
  return (
    <section aria-labelledby="cs-title" className="cs-glow relative overflow-hidden">
      <div
        aria-hidden="true"
        className="dotgrid absolute inset-0 -z-10 opacity-40 [mask-image:linear-gradient(to_bottom,black,transparent_75%)]"
      />
      <div className="container-nv grid items-center gap-14 pt-32 pb-20 md:pt-40 lg:grid-cols-[1.05fr_1fr] lg:pb-28">
        <div>
          <nav aria-label="Breadcrumb" className="text-sm text-muted">
            <Link href="/#roadmap" className="hover:text-accent">
              Roadmap
            </Link>
            <span aria-hidden="true"> / </span>
            <span aria-current="page">{product.title}</span>
          </nav>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <span className="cs-bg cs-text inline-grid size-12 place-items-center rounded-[14px]">
              <Icon name={product.icon} className="size-6" />
            </span>
            <StatusBadge variant="soon" className="text-xs" />
          </div>
          <h1
            id="cs-title"
            className="mt-6 text-[clamp(38px,5vw,64px)] leading-[1.03] tracking-[-0.04em] text-ink"
          >
            {product.title}
          </h1>
          <p className="cs-text mt-4 text-xl font-bold">{product.tagline}</p>
          <p className="lede mt-5 max-w-xl">{product.description}</p>
          <ul className="mt-6 flex flex-wrap gap-2" aria-label="Planned highlights">
            {product.highlights.map((highlight) => (
              <li
                key={highlight}
                className="cs-border inline-flex items-center gap-2 rounded-full border bg-card px-3.5 py-1.5 text-sm font-semibold text-ink-2"
              >
                <Icon name="i-check" className="cs-text size-3.5" />
                {highlight}
              </li>
            ))}
          </ul>
          <p className="mt-6 flex items-start gap-2 rounded-[12px] border border-soon/25 bg-soon-soft px-4 py-3 text-sm text-ink-2">
            <Icon name="i-clock" className="mt-0.5 size-4 text-soon" />
            This product is on the Nivomi roadmap and is not available yet. Today, Nivomi offers AI
            voice automation for sales teams.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <TrackedLink
              href="#notify"
              event="coming_soon_cta_clicked"
              props={{ slug: product.slug, placement: 'hero' }}
              className="btn btn-primary"
            >
              Get notified
              <Icon name="i-arrow" className="size-4" />
            </TrackedLink>
            <Link href="/#product" className="btn btn-secondary">
              Explore AI voice automation
            </Link>
          </div>
        </div>
        <ProductPreview preview={product.preview} />
      </div>
    </section>
  );
}

function BeforeAfter({ product }: { readonly product: ComingSoonProduct }) {
  return (
    <Section id="problem" eyebrow="Why it matters" title={product.problem.title}>
      <div className="grid gap-5 lg:grid-cols-2">
        <article className="card-nv p-7">
          <p className="text-sm font-bold tracking-[0.1em] text-muted uppercase">Today</p>
          <ul className="mt-5 grid gap-4">
            {product.problem.points.map((point) => (
              <li key={point} className="flex gap-3 text-[15.5px] text-ink-2">
                <span className="mt-1 inline-grid size-5 shrink-0 place-items-center rounded-full bg-warn-soft text-warn">
                  <Icon name="i-clock" className="size-3" />
                </span>
                {point}
              </li>
            ))}
          </ul>
        </article>
        <article className="cs-border relative overflow-hidden rounded-[20px] border-2 bg-card p-7 shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="cs-text text-sm font-bold tracking-[0.1em] uppercase">
              With {product.title}
            </p>
            <StatusBadge variant="soon" />
          </div>
          <ul className="mt-5 grid gap-4">
            {product.outcomes.map((outcome) => (
              <li key={outcome} className="flex gap-3 text-[15.5px] text-ink">
                <span className="cs-bg cs-text mt-1 inline-grid size-5 shrink-0 place-items-center rounded-full">
                  <Icon name="i-check" className="size-3" />
                </span>
                {outcome}
              </li>
            ))}
          </ul>
        </article>
      </div>
    </Section>
  );
}

function WorkflowStepper({ product }: { readonly product: ComingSoonProduct }) {
  return (
    <Section
      id="workflow"
      tone="soft"
      eyebrow="Planned workflow"
      title="How it is planned to work"
      lede="A preview of the intended flow. Details will be refined with early customers."
    >
      <ol
        aria-label={`${product.title} planned workflow`}
        className={cx(
          'grid gap-4 sm:grid-cols-2',
          product.workflow.length > 6 ? 'lg:grid-cols-7' : 'lg:grid-cols-6',
        )}
      >
        {product.workflow.map((step, index) => (
          <li key={step.label} className="relative">
            <div className="card-nv flex h-full flex-col items-center gap-3 px-3 py-6 text-center">
              <span className="cs-bg cs-text inline-grid size-12 place-items-center rounded-full">
                <Icon name={step.icon} className="size-5" />
              </span>
              <span className="font-mono text-[11px] text-muted">
                Step {String(index + 1).padStart(2, '0')}
              </span>
              <span className="text-sm font-bold text-ink">{step.label}</span>
            </div>
            {index < product.workflow.length - 1 && (
              <Icon
                name="i-arrow"
                className="cs-text absolute top-1/2 -right-3.5 z-10 hidden size-4 -translate-y-1/2 lg:block"
              />
            )}
          </li>
        ))}
      </ol>
    </Section>
  );
}

function Capabilities({ product }: { readonly product: ComingSoonProduct }) {
  return (
    <Section id="capabilities" eyebrow="Planned capabilities" title="What it will do">
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {product.capabilities.map((capability, index) => (
          <li key={capability.title} className="card-nv nv-reveal p-6">
            <div className="flex items-start justify-between gap-3">
              <span className="cs-bg cs-text inline-grid size-10 place-items-center rounded-[12px] font-mono text-sm font-bold">
                {String(index + 1).padStart(2, '0')}
              </span>
              <StatusBadge variant="soon" className="shrink-0" />
            </div>
            <h3 className="mt-4 text-lg text-ink">{capability.title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">{capability.body}</p>
          </li>
        ))}
      </ul>
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {product.benefits.map((benefit) => (
          <article key={benefit.title} className="cs-bg rounded-[20px] p-6">
            <h3 className="text-lg text-ink">{benefit.title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{benefit.body}</p>
          </article>
        ))}
      </div>
    </Section>
  );
}

const platformToday = [
  'One lead list and contact record',
  'Your own connected CRM',
  'Roles and organisation separation',
  'Human escalation and audit trail',
];

function Platform({ product }: { readonly product: ComingSoonProduct }) {
  return (
    <Section
      id="connections"
      tone="soft"
      eyebrow="Integration preview"
      title="Built on the Nivomi platform"
      lede={`${product.title} is planned to run on the same foundation as Nivomi AI voice, so it shares your leads, CRM connection, roles and audit trail.`}
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <article className="card-nv p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg text-ink">Nivomi platform</h3>
            <StatusBadge variant="mvp" />
          </div>
          <ul className="mt-5 grid gap-3">
            {platformToday.map((item) => (
              <li key={item} className="flex items-center gap-3 text-[15px] text-ink-2">
                <Icon name="i-check-c" className="size-4 text-live" />
                {item}
              </li>
            ))}
          </ul>
        </article>
        <article className="card-nv p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg text-ink">Planned connections</h3>
            <StatusBadge variant="soon" />
          </div>
          <ul className="mt-5 grid gap-3">
            {product.connections.map((connection) => (
              <li
                key={connection.name}
                className="flex items-center justify-between gap-3 rounded-[12px] border border-line bg-surface px-4 py-3"
              >
                <span className="font-semibold text-ink">{connection.name}</span>
                <span className="text-right text-sm text-muted">{connection.note}</span>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </Section>
  );
}

function Faq({ product }: { readonly product: ComingSoonProduct }) {
  return (
    <Section id="faq" eyebrow="Questions" title="Frequently asked">
      <div className="grid max-w-3xl gap-3">
        {product.faq.map((item) => (
          <details
            key={item.q}
            className="card-nv group p-0 [&_summary::-webkit-details-marker]:hidden"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 text-left font-semibold text-ink">
              {item.q}
              <Icon
                name="i-plus"
                className="cs-text size-5 transition-transform group-open:rotate-45"
              />
            </summary>
            <p className="px-6 pb-5 text-[15px] leading-relaxed text-muted">{item.a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}

function OtherProducts({ current }: { readonly current: string }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {comingSoonProducts
        .filter((product) => product.slug !== current)
        .map((product) => (
          <li key={product.slug} className={`cs-accent-${product.accent}`}>
            <Link
              href={`/coming-soon/${product.slug}`}
              className="card-nv flex h-full flex-col gap-3 p-4 hover:border-line-hover"
            >
              <span className="cs-bg cs-text inline-grid size-10 place-items-center rounded-[12px]">
                <Icon name={product.icon} />
              </span>
              <span className="text-sm font-bold text-ink">{product.title}</span>
              <span className="text-xs text-muted">{product.tagline}</span>
            </Link>
          </li>
        ))}
    </ul>
  );
}

/**
 * Shared, data-driven template for every Coming Soon product page. Each product brings its own
 * accent colour, mockup, workflow, capabilities and FAQ from `comingSoonProducts`.
 */
export function ComingSoonPage({ product }: { readonly product: ComingSoonProduct }) {
  return (
    <div className={`cs-accent-${product.accent}`}>
      <TrackOnView event="coming_soon_viewed" props={{ slug: product.slug }} />
      <ComingSoonHero product={product} />
      <BeforeAfter product={product} />
      <WorkflowStepper product={product} />
      <Capabilities product={product} />
      <Platform product={product} />
      <Faq product={product} />

      <section
        id="notify"
        aria-labelledby="notify-title"
        className="section-nv cs-glow scroll-mt-20"
      >
        <div className="container-nv grid items-start gap-12 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <p className="eyebrow">Stay informed</p>
            <h2 id="notify-title" className="h2-nv mt-4 text-ink">
              Interested in {product.title}?
            </h2>
            <p className="lede mt-5">
              Tell us about your use case. We’ll let you know when it opens for early customers —
              and you can start with Nivomi AI voice today.
            </p>
          </div>
          <LeadForm
            fixedIntent="coming-soon"
            interest={product.title}
            placement={`coming_soon_${product.slug}`}
          />
        </div>
      </section>

      <Section
        id="more"
        tone="soft"
        eyebrow="Also on the roadmap"
        title="More from Nivomi, coming soon"
      >
        <OtherProducts current={product.slug} />
      </Section>
    </div>
  );
}
