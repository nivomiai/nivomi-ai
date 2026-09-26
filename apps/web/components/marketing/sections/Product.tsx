import Image from 'next/image';
import { capabilities, howItWorks, outcomes, problems } from '@/lib/site/content';
import { FeatureCard, Icon, Section, StatusBadge } from '../primitives';

export function Problem() {
  return (
    <Section
      id="why"
      eyebrow="The problem"
      title={
        <>
          Sales teams have leads.{' '}
          <span className="grad-text">Following up every one is the hard part.</span>
        </>
      }
      lede="Nivomi takes on the repetitive first conversation, so your team spends its time on the leads that are ready to talk."
    >
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {problems.map((item) => (
          <FeatureCard key={item.title} {...item} />
        ))}
      </div>
      <ul className="mt-10 grid gap-3 rounded-[20px] border border-line bg-soft p-5 sm:grid-cols-3 sm:p-6">
        {outcomes.map((outcome) => (
          <li
            key={outcome}
            className="flex items-center gap-3 text-lg font-bold tracking-tight text-ink"
          >
            <span className="inline-grid size-8 shrink-0 place-items-center rounded-full bg-[image:var(--nv-grad)] text-white">
              <Icon name="i-check" className="size-4" />
            </span>
            {outcome}
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function HowItWorks() {
  let counter = 0;
  return (
    <Section
      id="how-it-works"
      tone="soft"
      eyebrow="How Nivomi works"
      title="From lead list to CRM update, in nine steps."
      lede="You bring the leads and the questions. Nivomi runs the calls and hands your team clear outcomes."
    >
      <div className="grid gap-6 lg:grid-cols-3">
        {howItWorks.map((phase) => (
          <div key={phase.phase} className="card-nv nv-reveal p-6">
            <p className="eyebrow">{phase.phase}</p>
            <ol className="mt-5 grid gap-5">
              {phase.steps.map((step) => {
                counter += 1;
                return (
                  <li key={step.title} className="flex gap-4">
                    <span className="inline-grid size-9 shrink-0 place-items-center rounded-full bg-[image:var(--nv-grad)] font-mono text-sm font-bold text-white shadow-pink">
                      {counter}
                    </span>
                    <div>
                      <h3 className="text-base text-ink">{step.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted">{step.body}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>
    </Section>
  );
}

export function Capabilities() {
  return (
    <Section
      id="product"
      eyebrow="The Nivomi MVP"
      title={
        <>
          Everything an AI voice campaign needs, <span className="grad-text">in one platform.</span>
        </>
      }
      lede="These capabilities make up the Nivomi launch release, now in early access with design partners."
    >
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {capabilities.map((item) => (
          <FeatureCard key={item.title} {...item} badge={<StatusBadge variant="mvp" />} />
        ))}
      </div>
    </Section>
  );
}

const transcript = [
  {
    who: 'AI',
    text: 'Hello, this is the AI assistant calling for Kochi Homes about your enquiry. Is this a good time?',
  },
  { who: 'Lead', text: 'Yes, go ahead.' },
  { who: 'AI', text: 'Which budget range are you considering for the apartment?' },
  { who: 'Lead', text: 'Around sixty to seventy lakh.' },
  { who: 'AI', text: 'Thank you. Would a site visit this Saturday at 11 AM work for you?' },
  { who: 'Lead', text: 'Saturday is fine.' },
] as const;

const voiceSteps = [
  {
    icon: 'i-mic',
    title: 'Listens',
    body: 'Streaming speech recognition tuned for Indian languages and phone audio.',
  },
  {
    icon: 'i-spark',
    title: 'Understands',
    body: 'A configurable language model answers only from the information you approve.',
  },
  {
    icon: 'i-phone',
    title: 'Responds',
    body: 'A natural Indian-language voice replies with low latency, so the conversation flows.',
  },
  {
    icon: 'i-pause',
    title: 'Lets callers interrupt',
    body: 'When the lead starts talking, the AI stops and listens (barge-in).',
  },
  {
    icon: 'i-layers',
    title: 'Keeps track',
    body: 'Conversation state remembers what was asked, answered and agreed.',
  },
  {
    icon: 'i-shield',
    title: 'Stays honest',
    body: 'It says it is an AI at the start of every call and never claims to be human.',
  },
] as const;

export function VoiceWorkflow() {
  return (
    <Section
      id="voice-workflow"
      tone="soft"
      eyebrow="The AI voice workflow"
      title="A real phone conversation, not a recorded message."
      lede="Every turn follows the same loop: listen, understand, respond — with your rules deciding what the AI may say and do."
    >
      <div className="grid items-start gap-10 lg:grid-cols-[1fr_1.05fr]">
        <ul className="grid gap-4 sm:grid-cols-2">
          {voiceSteps.map((step) => (
            <li key={step.title} className="card-nv nv-reveal flex gap-4 p-5">
              <span className="icon-tile size-10 shrink-0">
                <Icon name={step.icon} />
              </span>
              <div>
                <h3 className="text-base text-ink">{step.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ul>

        <figure className="card-nv overflow-hidden shadow-md">
          <div className="flex items-center gap-3 border-b border-line px-5 py-4">
            <Image
              src="/brand/ai-agent.webp"
              alt=""
              width={40}
              height={40}
              className="size-10 rounded-full border border-line bg-white object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-ink">Example conversation</p>
              <p className="text-xs text-muted">Outbound call · Real-estate enquiry</p>
            </div>
            <StatusBadge variant="preview" label="Example" />
          </div>
          <ol className="grid gap-3 p-5">
            {transcript.map((line, index) => (
              <li
                key={index}
                className={
                  line.who === 'AI'
                    ? 'max-w-[88%] rounded-[16px] rounded-tl-sm border border-line bg-soft px-4 py-2.5 text-sm text-ink-2'
                    : 'ml-auto max-w-[80%] rounded-[16px] rounded-tr-sm bg-[image:var(--nv-grad)] px-4 py-2.5 text-sm text-white'
                }
              >
                <span className="sr-only">{line.who === 'AI' ? 'AI agent: ' : 'Lead: '}</span>
                {line.text}
              </li>
            ))}
          </ol>
          <figcaption className="flex flex-wrap gap-2 border-t border-line bg-soft px-5 py-3 text-xs font-semibold text-ink-2">
            {['Qualified', 'Appointment booked', 'Summary saved', 'CRM updated'].map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1.5 rounded-full bg-live-soft px-2.5 py-1 text-live"
              >
                <Icon name="i-check" className="size-3" />
                {tag}
              </span>
            ))}
            <span className="ml-auto self-center font-normal text-muted">Example data</span>
          </figcaption>
        </figure>
      </div>
    </Section>
  );
}
