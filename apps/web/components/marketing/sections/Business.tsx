import Link from 'next/link';
import { comingSoonProducts } from '@/lib/site/coming-soon';
import {
  capabilities,
  integrationGroups,
  plans,
  pricingModel,
  trustPoints,
  useCases,
} from '@/lib/site/content';
import { cx } from '@/lib/site/cx';
import { CheckList, FeatureCard, Icon, Section, StatusBadge } from '../primitives';
import { TrackOnView, TrackedLink } from '../tracking';

export function Roadmap() {
  return (
    <Section
      id="roadmap"
      eyebrow="Roadmap"
      title={
        <>
          Voice today. <span className="grad-text">More AI managers next.</span>
        </>
      }
      lede="Nivomi launches with AI voice automation for sales teams. These products are on the roadmap — they are not available yet."
    >
      <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="band-plum relative overflow-hidden rounded-[24px] p-7 text-white">
          <StatusBadge variant="mvp" className="!border-white/20 !bg-white/10 !text-white" />
          <p className="mt-6 text-sm font-semibold tracking-[0.12em] text-pink-light uppercase">
            Nivomi today
          </p>
          <h3 className="mt-2 text-3xl text-white">AI voice automation</h3>
          <p className="mt-3 text-white/75">
            Outbound and inbound AI calls, qualification, appointments, human escalation,
            transcripts, summaries and CRM sync.
          </p>
          <Link
            href="#product"
            className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-pink-light hover:text-white"
          >
            See the MVP capabilities
            <Icon name="i-arrow" className="size-4" />
          </Link>
        </div>

        <div>
          <p className="mb-4 text-sm font-bold tracking-[0.12em] text-muted uppercase">
            What’s next
          </p>
          <ul className="grid gap-4 sm:grid-cols-2">
            {comingSoonProducts.map((product) => (
              <li key={product.slug} className={`cs-accent-${product.accent}`}>
                <Link
                  href={`/coming-soon/${product.slug}`}
                  className="card-nv group flex h-full items-start gap-4 p-5 transition-colors hover:border-line-hover"
                >
                  <span className="cs-bg cs-text inline-grid size-11 shrink-0 place-items-center rounded-[12px]">
                    <Icon name={product.icon} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-ink">{product.title}</span>
                      <StatusBadge variant="soon" />
                    </span>
                    <span className="mt-1.5 block text-sm leading-relaxed text-muted">
                      {product.tagline}
                    </span>
                  </span>
                  <Icon
                    name="i-arrow"
                    className="mt-1 size-4 text-muted transition-transform group-hover:translate-x-0.5"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}

export function UseCases() {
  return (
    <Section
      id="use-cases"
      tone="soft"
      eyebrow="Use cases"
      title="For any sales team that follows up leads by phone."
      lede="Nivomi is not tied to one industry — the questions, language and rules come from your team."
    >
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {useCases.map((useCase) => (
          <FeatureCard key={useCase.title} {...useCase} />
        ))}
        <article className="card-nv flex flex-col justify-between gap-4 border-dashed p-6">
          <div>
            <h3 className="text-lg text-ink">Hotels or logistics?</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">
              Guest and shipment workflows are on the roadmap.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/coming-soon/hotel-automation"
              className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-sm font-semibold text-ink-2 hover:border-line-hover"
            >
              Hotel automation <StatusBadge variant="soon" className="!px-1.5 !py-0.5" />
            </Link>
            <Link
              href="/coming-soon/logistics-automation"
              className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-sm font-semibold text-ink-2 hover:border-line-hover"
            >
              Logistics automation <StatusBadge variant="soon" className="!px-1.5 !py-0.5" />
            </Link>
          </div>
        </article>
      </div>
    </Section>
  );
}

export function Pricing() {
  return (
    <Section
      id="pricing"
      center
      eyebrow="Plans"
      title="Plans designed around usage."
      lede="Every plan combines a subscription, included call minutes and metered usage beyond them. Prices will be published after the early-access pilot."
    >
      <TrackOnView event="pricing_viewed" />
      <ol
        aria-label="How pricing works"
        className="mx-auto mb-12 grid max-w-3xl gap-3 sm:grid-cols-3"
      >
        {pricingModel.map((part, index) => (
          <li key={part.title} className="rounded-[16px] border border-line bg-soft p-4 text-left">
            <span className="font-mono text-xs text-accent">
              {index === 0 ? '' : '+ '}
              {part.title}
            </span>
            <p className="mt-1 text-sm text-muted">{part.body}</p>
          </li>
        ))}
      </ol>
      <div className="grid gap-5 text-left lg:grid-cols-3">
        {plans.map((plan) => (
          <article
            key={plan.name}
            className={cx(
              'card-nv flex flex-col p-7',
              plan.highlighted && 'border-pink shadow-md ring-4 ring-accent-tint',
            )}
          >
            <h3 className="text-xl text-ink">{plan.name}</h3>
            <p className="mt-2 min-h-[48px] text-[15px] text-muted">{plan.audience}</p>
            <p className="mt-6 text-2xl font-extrabold tracking-tight text-ink">{plan.price}</p>
            <TrackedLink
              href="#contact"
              event="demo_cta_clicked"
              props={{ placement: `pricing_${plan.name.toLowerCase()}` }}
              className={cx('btn mt-6', plan.highlighted ? 'btn-primary' : 'btn-secondary')}
            >
              {plan.cta}
            </TrackedLink>
          </article>
        ))}
      </div>
      <div className="mt-10 rounded-[20px] border border-line bg-soft p-6 text-left">
        <h3 className="text-base text-ink">Every plan includes the voice platform</h3>
        <CheckList
          items={capabilities.map((capability) => capability.title)}
          className="mt-4 sm:grid-cols-2 lg:grid-cols-3"
        />
      </div>
    </Section>
  );
}

export function Integrations() {
  return (
    <Section
      id="integrations"
      tone="soft"
      eyebrow="Integrations"
      title="Connected to the tools your team and the platform rely on."
      lede="Lead sources and CRM on one side; the voice, AI and infrastructure providers Nivomi is built on, on the other. Each provider sits behind an abstraction, so it can be replaced."
    >
      <div className="grid gap-5 lg:grid-cols-3">
        {integrationGroups.map((group) => (
          <article key={group.title} className="card-nv p-6">
            <h3 className="text-lg text-ink">{group.title}</h3>
            <ul className="mt-5 grid gap-2.5">
              {group.items.map((item) => (
                <li
                  key={item.name}
                  className="flex items-center justify-between gap-3 rounded-[12px] border border-line-2 bg-surface px-4 py-3"
                >
                  <span>
                    <span className="block font-semibold text-ink">{item.name}</span>
                    <span className="block text-xs text-muted">{item.note}</span>
                  </span>
                  {item.soon && <StatusBadge variant="soon" />}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      <p className="mt-6 text-xs text-muted">
        Product names are trademarks of their respective owners and are listed for reference only.
      </p>
    </Section>
  );
}

export function Trust() {
  return (
    <Section
      id="trust"
      eyebrow="Trust and security"
      title="Built as a multi-tenant platform from day one."
      lede="Security, tenant separation and compliance-aware calling are part of the architecture, not add-ons."
    >
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {trustPoints.map((point) => (
          <FeatureCard key={point.title} {...point} />
        ))}
      </div>
      <p className="mt-8 max-w-3xl text-sm text-muted">
        Nivomi is in early access and does not yet hold third-party security certifications. Ask us
        about our security approach during your demo.
      </p>
    </Section>
  );
}
