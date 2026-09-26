import type { ReactNode } from 'react';
import { siteConfig } from '@/lib/site/config';
import { Icon } from '../primitives';

export interface LegalSection {
  readonly id: string;
  readonly title: string;
  readonly body: ReactNode;
}

/** Placeholder legal document with a prominent legal-review warning. */
export function LegalPage({
  title,
  summary,
  updated,
  sections,
}: {
  readonly title: string;
  readonly summary: string;
  readonly updated: string;
  readonly sections: readonly LegalSection[];
}) {
  return (
    <div className="container-nv pt-32 pb-24 md:pt-40">
      <div className="mx-auto max-w-3xl">
        <div
          role="note"
          className="flex items-start gap-3 rounded-[16px] border-2 border-warn/40 bg-warn-soft p-5 text-warn"
        >
          <Icon name="i-shield" className="mt-0.5 size-5" />
          <div>
            <p className="font-extrabold tracking-[0.06em] uppercase">
              Legal review required before production launch
            </p>
            <p className="mt-1 text-sm text-ink-2">
              This is placeholder text prepared for structure only. It is not legal advice and is
              not the final {title.toLowerCase()} of {siteConfig.legalName}.
            </p>
          </div>
        </div>

        <h1 className="mt-10 text-[clamp(36px,5vw,56px)] tracking-[-0.04em] text-ink">{title}</h1>
        <p className="lede mt-4">{summary}</p>
        <p className="mt-3 text-sm text-muted">Draft last updated {updated}</p>

        <nav aria-label="Contents" className="mt-10 rounded-[16px] border border-line bg-soft p-5">
          <p className="text-sm font-bold text-ink">Contents</p>
          <ol className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
            {sections.map((section, index) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className="text-ink-2 hover:text-accent">
                  {index + 1}. {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-12 grid gap-10">
          {sections.map((section, index) => (
            <section
              key={section.id}
              id={section.id}
              aria-labelledby={`${section.id}-title`}
              className="scroll-mt-28"
            >
              <h2 id={`${section.id}-title`} className="text-2xl text-ink">
                {index + 1}. {section.title}
              </h2>
              <div className="mt-3 grid gap-3 text-[15.5px] leading-relaxed text-ink-2 [&_ul]:grid [&_ul]:list-disc [&_ul]:gap-1.5 [&_ul]:pl-5">
                {section.body}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
