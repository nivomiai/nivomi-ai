import {
  escalationTriggers,
  inboundModes,
  inboundPoints,
  outboundPipeline,
  outboundPoints,
} from '@/lib/site/content';
import { CheckList, FeatureCard, FlowDiagram, Icon, Section, StatusBadge } from '../primitives';

export function Outbound() {
  return (
    <Section
      id="outbound"
      eyebrow="Outbound calling"
      title={
        <>
          Call every lead, <span className="grad-text">at the pace you choose.</span>
        </>
      }
      lede="Launch a campaign over the leads you select. Nivomi dials within your calling hours, retries on your schedule and records every outcome."
    >
      <div className="card-nv nv-reveal p-5 sm:p-7">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-ink">Outbound campaign</p>
          <StatusBadge variant="mvp" />
        </div>
        <FlowDiagram steps={outboundPipeline} label="Outbound campaign workflow" animated />
      </div>
      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_0.9fr]">
        <CheckList items={outboundPoints} />
        <aside className="rounded-[20px] border border-line bg-soft p-6">
          <div className="flex items-center gap-3">
            <span className="icon-tile">
              <Icon name="i-shield" />
            </span>
            <h3 className="text-lg text-ink">Compliance-aware by design</h3>
          </div>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            Nivomi’s calling engine is designed around jurisdiction-specific calling requirements —
            consent, do-not-call preferences, calling hours and opt-outs. If something is unknown,
            the call does not go ahead. Your organisation remains responsible for its own
            compliance.
          </p>
        </aside>
      </div>
    </Section>
  );
}

export function Inbound() {
  return (
    <Section
      id="inbound"
      tone="soft"
      eyebrow="Inbound calling"
      title="Answer incoming calls your way."
      lede="Give your team a Nivomi phone number and decide who answers: the AI, your team, or the AI first with a person ready to take over."
    >
      <div className="grid items-start gap-10 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="card-nv nv-reveal p-6">
          <FlowDiagram
            steps={['Nivomi phone number', 'Incoming call', 'Your routing', 'AI or your team']}
            label="Inbound call routing"
            orientation="vertical"
          />
          <p className="mt-5 text-sm text-muted">
            When the AI is answering, it can escalate to a human agent at any point in the call.
          </p>
        </div>
        <div>
          <div className="grid gap-5 sm:grid-cols-3">
            {inboundModes.map((mode) => (
              <FeatureCard key={mode.title} {...mode} />
            ))}
          </div>
          <CheckList items={inboundPoints} className="mt-8" />
        </div>
      </div>
    </Section>
  );
}

export function Escalation() {
  return (
    <section
      id="escalation"
      aria-labelledby="escalation-title"
      className="section-nv band-plum relative overflow-hidden text-white"
    >
      <div className="container-nv grid items-center gap-12 lg:grid-cols-[1fr_1fr]">
        <div>
          <p className="eyebrow !text-pink-light">Human escalation</p>
          <h2 id="escalation-title" className="h2-nv mt-4 text-white">
            AI handles the conversation, with human escalation when needed.
          </h2>
          <p className="mt-5 text-[17px] leading-relaxed text-white/75">
            Nivomi never treats a difficult moment as the end of the call. When the conversation
            needs a person, the AI hands over — live, or as a scheduled callback with a task for
            your team.
          </p>
          <ol
            aria-label="Escalation flow"
            className="mt-8 flex flex-wrap items-center gap-2 text-sm font-semibold"
          >
            {['AI', 'Understand', 'Detect escalation condition', 'Human handoff'].map(
              (step, index, all) => (
                <li key={step} className="flex items-center gap-2">
                  <span className="rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5">
                    {step}
                  </span>
                  {index < all.length - 1 && (
                    <Icon name="i-arrow" className="size-4 text-pink-light" />
                  )}
                </li>
              ),
            )}
          </ol>
        </div>
        <div className="rounded-[24px] border border-white/10 bg-white/[0.06] p-6 backdrop-blur sm:p-8">
          <h3 className="text-lg text-white">When the AI brings in your team</h3>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {escalationTriggers.map((trigger) => (
              <li
                key={trigger}
                className="flex items-start gap-2.5 rounded-[12px] border border-white/10 bg-white/[0.04] px-3.5 py-3 text-sm text-white/85"
              >
                <Icon name="i-user" className="mt-0.5 size-4 text-pink-light" />
                {trigger}
              </li>
            ))}
          </ul>
          <p className="mt-5 text-sm text-white/65">
            No one available? Nivomi offers a callback, creates a task for your team and updates the
            CRM — the caller is never simply disconnected.
          </p>
        </div>
      </div>
    </section>
  );
}
