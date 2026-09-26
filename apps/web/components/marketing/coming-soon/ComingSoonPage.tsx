import Link from 'next/link';
import { type ComingSoonProduct, comingSoonProducts } from '@/lib/site/coming-soon';
import { LeadForm } from '../LeadForm';
import { CheckList, FlowDiagram, Icon, Section, StatusBadge } from '../primitives';
import { TrackOnView, TrackedLink } from '../tracking';
import { ProductPreview } from './ProductPreview';

function ComingSoonHero({ product }: { readonly product: ComingSoonProduct }) {
  return (
    <section aria-labelledby="cs-title" className="hero-glow relative overflow-hidden">
      <div className="container-nv grid items-center gap-12 pt-32 pb-20 md:pt-40 lg:grid-cols-[1fr_1fr]">
        <div>
          <nav aria-label="Breadcrumb" className="text-sm text-muted">
            <Link href="/#roadmap" className="hover:text-accent">
              Roadmap
            </Link>
            <span aria-hidden="true"> / </span>
            <span aria-current="page">{product.title}</span>
          </nav>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <span className="inline-grid size-12 place-items-center rounded-[14px] bg-soon-soft text-soon">
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
          <p className="mt-4 text-xl font-semibold text-ink-2">{product.tagline}</p>
          <p className="lede mt-5 max-w-xl">{product.description}</p>
          <p className="mt-5 inline-flex items-start gap-2 rounded-[12px] border border-soon/25 bg-soon-soft px-4 py-3 text-sm text-ink-2">
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
        <ProductPreview title={product.title} preview={product.preview} />
      </div>
    </section>
  );
}

function OtherProducts({ current }: { readonly current: string }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {comingSoonProducts
        .filter((product) => product.slug !== current)
        .map((product) => (
          <li key={product.slug}>
            <Link
              href={`/coming-soon/${product.slug}`}
              className="card-nv flex h-full items-center gap-3 p-4 text-sm font-semibold text-ink hover:border-line-hover"
            >
              <Icon name={product.icon} className="text-soon" />
              {product.title}
            </Link>
          </li>
        ))}
    </ul>
  );
}

/** Shared template for every Coming Soon product page; content comes from `comingSoonProducts`. */
export function ComingSoonPage({ product }: { readonly product: ComingSoonProduct }) {
  return (
    <>
      <TrackOnView event="coming_soon_viewed" props={{ slug: product.slug }} />
      <ComingSoonHero product={product} />

      <Section id="problem" eyebrow="The problem" title={product.problem.title}>
        <CheckList items={product.problem.points} className="max-w-3xl" />
      </Section>

      <Section
        id="workflow"
        tone="soft"
        eyebrow="Planned workflow"
        title="How it is planned to work"
        lede="A preview of the intended flow. Details will be refined with early customers."
      >
        <div className="card-nv p-5 sm:p-7">
          <div className="mb-5 flex justify-end">
            <StatusBadge variant="soon" />
          </div>
          <FlowDiagram steps={product.workflow} label={`${product.title} planned workflow`} />
        </div>
      </Section>

      <Section id="capabilities" eyebrow="Planned capabilities" title="What it will do">
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {product.capabilities.map((capability) => (
            <li key={capability.title} className="card-nv p-6">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg text-ink">{capability.title}</h3>
                <StatusBadge variant="soon" className="shrink-0" />
              </div>
              <p className="mt-2 text-[15px] leading-relaxed text-muted">{capability.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="benefits" tone="soft" eyebrow="Why it matters" title="What your team gains">
        <div className="grid gap-5 md:grid-cols-3">
          {product.benefits.map((benefit) => (
            <article key={benefit.title} className="card-nv p-6">
              <h3 className="text-lg text-ink">{benefit.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted">{benefit.body}</p>
            </article>
          ))}
        </div>
      </Section>

      <Section
        id="connections"
        eyebrow="Integration preview"
        title="Planned connections"
        lede="Built on the same Nivomi platform as AI voice: one lead list, one CRM connection, the same roles and audit trail."
      >
        <ul className="grid gap-3 md:grid-cols-3">
          {product.connections.map((connection) => (
            <li
              key={connection.name}
              className="rounded-[14px] border border-line bg-card px-5 py-4"
            >
              <span className="block font-semibold text-ink">{connection.name}</span>
              <span className="block text-sm text-muted">{connection.note}</span>
            </li>
          ))}
        </ul>
      </Section>

      <section
        id="notify"
        aria-labelledby="notify-title"
        className="section-nv hero-glow scroll-mt-20"
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
    </>
  );
}
