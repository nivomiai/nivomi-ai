import { dataSources, languages, loopPipeline } from '@/lib/site/content';
import { FlowDiagram, Icon, LogoMark, Section } from '../primitives';

export function DataSources() {
  return (
    <Section
      id="data-sources"
      eyebrow="Leads in, outcomes out"
      title={
        <>
          Start with a spreadsheet.{' '}
          <span className="grad-text">Connect your CRM when you’re ready.</span>
        </>
      }
      lede="Every source lands in one Nivomi lead list, so campaigns work the same whether your leads come from Excel, a CRM or your website. A CRM is optional."
    >
      <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto_1fr]">
        <ul className="grid gap-3" aria-label="Lead sources">
          {dataSources.slice(0, 3).map((source) => (
            <li
              key={source.title}
              className="card-nv nv-reveal flex items-center gap-3 px-4 py-3.5"
            >
              <span className="icon-tile size-10">
                <Icon name={source.icon} />
              </span>
              <span className="font-semibold text-ink">{source.title}</span>
              <Icon name="i-arrow" className="ml-auto size-4 text-muted max-lg:rotate-90" />
            </li>
          ))}
        </ul>

        <div className="mx-auto grid size-36 place-items-center rounded-full border border-accent-tint bg-accent-soft shadow-pink">
          <div className="text-center">
            <LogoMark className="mx-auto h-9 w-auto" />
            <p className="mt-2 font-brand text-sm font-bold text-ink">Nivomi</p>
            <p className="text-[11px] text-muted">One lead list</p>
          </div>
        </div>

        <div className="card-nv nv-reveal p-5">
          <p className="mb-4 text-sm font-semibold text-ink">Then, for every lead</p>
          <FlowDiagram steps={loopPipeline} label="Lead to CRM sync" orientation="vertical" />
        </div>
      </div>

      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {dataSources.map((source) => (
          <article key={source.title} className="card-nv nv-reveal p-6">
            <span className="icon-tile">
              <Icon name={source.icon} />
            </span>
            <h3 className="mt-4 text-lg text-ink">{source.title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">{source.body}</p>
          </article>
        ))}
      </div>
    </Section>
  );
}

export function Languages() {
  return (
    <Section
      id="languages"
      tone="soft"
      center
      eyebrow="Built for India"
      title="Built for multilingual conversations across India’s major business languages."
      lede="Each campaign and AI agent can use the language your leads prefer, including the code-mixed speech common on real calls."
    >
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {languages.map((language) => (
          <li
            key={language.code}
            lang={language.code}
            className="card-nv nv-reveal flex flex-col items-center gap-1 px-4 py-6 text-center"
          >
            <span className="text-2xl font-bold text-ink">{language.native}</span>
            <span lang="en" className="text-sm text-muted">
              {language.name}
            </span>
          </li>
        ))}
      </ul>
      <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-muted">
        Language availability and voice quality depend on provider support and validation; each
        language is tested with real phone calls before it is offered.
      </p>
    </Section>
  );
}
