import Link from 'next/link';
import { comingSoonProducts } from '@/lib/site/coming-soon';
import { siteConfig } from '@/lib/site/config';
import { Logo } from './primitives';

const productLinks = [
  { label: 'Capabilities', href: '/#product' },
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'Outbound calls', href: '/#outbound' },
  { label: 'Inbound calls', href: '/#inbound' },
  { label: 'Integrations', href: '/#integrations' },
];

const companyLinks = [
  { label: 'Use cases', href: '/#use-cases' },
  { label: 'Pricing', href: '/#pricing' },
  { label: 'Contact', href: '/#contact' },
  { label: 'Login', href: '/login' },
];

function Column({
  title,
  links,
}: {
  readonly title: string;
  readonly links: readonly { readonly label: string; readonly href: string }[];
}) {
  return (
    <div>
      <h2 className="text-sm font-bold tracking-[0.1em] text-white/60 uppercase">{title}</h2>
      <ul className="mt-4 grid gap-2.5">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="text-[15px] text-white/80 hover:text-white">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="band-plum relative overflow-hidden text-white">
      <div className="container-nv grid gap-12 pt-16 pb-10 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Link href="/" aria-label="Nivomi AI home" className="inline-block rounded-md">
            <Logo tone="light" />
          </Link>
          <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-white/70">
            AI voice automation for sales teams: calls, qualification, appointments and human
            handoff, with transcripts, summaries and CRM sync.
          </p>
          <p className="mt-5 text-sm text-white/60">
            <a href={`mailto:${siteConfig.contact.email}`} className="hover:text-white">
              {siteConfig.contact.email}
            </a>
            <br />
            <a href={siteConfig.contact.phoneHref} className="hover:text-white">
              {siteConfig.contact.phoneDisplay}
            </a>
          </p>
        </div>
        <Column title="Product" links={productLinks} />
        <Column
          title="Coming soon"
          links={comingSoonProducts.map((product) => ({
            label: product.title,
            href: `/coming-soon/${product.slug}`,
          }))}
        />
        <Column title="Company" links={companyLinks} />
      </div>
      <div className="container-nv flex flex-col gap-3 border-t border-white/10 py-6 text-sm text-white/55 sm:flex-row sm:items-center sm:justify-between">
        <p>
          © {year} {siteConfig.legalName} · Kozhikode, Kerala, India
        </p>
        <nav aria-label="Legal" className="flex gap-5">
          <Link href="/privacy" className="hover:text-white">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-white">
            Terms
          </Link>
        </nav>
      </div>
      <p
        aria-hidden="true"
        className="pointer-events-none -mb-[0.2em] text-center font-brand text-[clamp(56px,15vw,200px)] leading-none font-bold tracking-[-0.04em] text-white/[0.05] select-none"
      >
        NIVOMI AI
      </p>
    </footer>
  );
}
