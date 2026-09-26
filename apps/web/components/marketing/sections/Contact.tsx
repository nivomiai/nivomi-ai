import { siteConfig } from '@/lib/site/config';
import { whatsappUrl } from '@/lib/site/lead-capture';
import { LeadForm } from '../LeadForm';
import { Icon } from '../primitives';

export function Contact() {
  const { contact } = siteConfig;
  return (
    <section id="contact" aria-labelledby="contact-title" className="section-nv hero-glow">
      <div className="container-nv grid items-start gap-12 lg:grid-cols-[0.85fr_1.15fr]">
        <div>
          <p className="eyebrow">Get started</p>
          <h2 id="contact-title" className="h2-nv mt-4 text-ink">
            See Nivomi on your own leads.
          </h2>
          <p className="lede mt-5">
            Tell us about your team and lead flow. We’ll show you how an AI voice campaign would
            work for you, and whether you’re a fit for the early-access pilot.
          </p>
          <ul className="mt-8 grid gap-4 text-[15px]">
            <li>
              <a
                href={`mailto:${contact.email}`}
                className="inline-flex items-center gap-3 font-semibold text-ink hover:text-accent"
              >
                <span className="icon-tile size-10">
                  <Icon name="i-mail" />
                </span>
                {contact.email}
              </a>
            </li>
            <li>
              <a
                href={contact.phoneHref}
                className="inline-flex items-center gap-3 font-semibold text-ink hover:text-accent"
              >
                <span className="icon-tile size-10">
                  <Icon name="i-phone" />
                </span>
                {contact.phoneDisplay}
              </a>
            </li>
            <li>
              <a
                href={whatsappUrl(contact.whatsapp, 'Hi Nivomi AI, I would like to know more.')}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-3 font-semibold text-ink hover:text-accent"
              >
                <span className="icon-tile size-10">
                  <Icon name="i-wa-line" />
                </span>
                Chat with our team on WhatsApp
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </li>
            <li className="inline-flex items-start gap-3 text-muted">
              <span className="icon-tile size-10 shrink-0">
                <Icon name="i-pin" />
              </span>
              <span>
                {contact.addressLines.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </span>
            </li>
          </ul>
        </div>
        <div id="get-started" className="scroll-mt-28">
          <LeadForm placement="homepage" />
        </div>
      </div>
    </section>
  );
}
