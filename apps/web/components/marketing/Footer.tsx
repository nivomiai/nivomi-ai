import Link from 'next/link';
import { siteConfig } from '@/lib/site/config';
import { footerColumns } from '@/lib/site/content';
import { Icon, Logo } from './primitives';

/** Footer of the React public pages, mirroring the homepage footer (public/site/home.html). */
export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="relative overflow-hidden border-t border-white/[0.06] bg-[#0d040b] pt-[clamp(72px,9vw,112px)] text-white/60 dark:bg-[#080207]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[-30%] left-1/2 h-[520px] w-[1100px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(204,0,126,0.16),transparent)]"
      />
      <div className="container-nv relative">
        <div className="grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3 md:gap-10 lg:grid-cols-[1.4fr_repeat(3,minmax(0,1fr))]">
          <div className="col-span-2 md:col-span-3 lg:col-span-1">
            <a href="/" aria-label="Nivomi AI home" className="inline-block rounded-md">
              <Logo tone="light" />
            </a>
            <p className="mt-[22px] max-w-[340px] text-base leading-[1.65] text-white/60">
              Custom AI Managers that handle calls, WhatsApp, leads, CRM, workflows and analytics —
              so your team can focus on growth.
            </p>
            <a
              href={`mailto:${siteConfig.contact.email}`}
              className="group mt-7 inline-flex items-center gap-2 text-base text-white/80 transition-colors hover:text-white"
            >
              {siteConfig.contact.email}
              <Icon
                name="i-arrow-ur"
                className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              />
            </a>
            <address className="mt-[18px] text-[13.5px] leading-[1.7] text-white/40 not-italic">
              {siteConfig.contact.addressLines.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </address>
          </div>

          {footerColumns.map((column) => (
            <div
              key={column.title}
              className={column.title === 'Contact' ? 'col-span-2 md:col-span-1' : undefined}
            >
              <h2 className="mb-[22px] font-mono text-[11.5px] font-medium tracking-[0.24em] text-white/40 uppercase">
                {column.title}
              </h2>
              <ul className="grid gap-3.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      {...(link.external ? { target: '_blank', rel: 'noopener' } : {})}
                      className="text-base text-white/65 transition-colors hover:text-white"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="font-mono mt-[clamp(56px,7vw,88px)] flex flex-col items-start justify-between gap-4 border-t border-white/[0.09] pt-7 text-[10.5px] tracking-[0.2em] text-white/40 uppercase md:flex-row md:flex-wrap md:items-center md:gap-x-8 md:text-[11.5px] md:tracking-[0.28em]">
          <span>
            © {year} · {siteConfig.legalName}
          </span>
          <span>AI Managers · Business Automation · Kerala, India</span>
          <nav aria-label="Legal" className="flex items-center gap-3">
            <Link href="/privacy" className="transition-colors hover:text-white">
              Privacy
            </Link>
            <span aria-hidden="true" className="opacity-50">
              ·
            </span>
            <Link href="/terms" className="transition-colors hover:text-white">
              Terms
            </Link>
          </nav>
        </div>

        <div
          aria-hidden="true"
          className="mt-[clamp(40px,6vw,72px)] pb-[clamp(8px,1.5vw,20px)] select-none"
        >
          <svg viewBox="0 0 1200 212" className="block h-auto w-full overflow-visible">
            <defs>
              <linearGradient id="site-footer-fade" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#fff" stopOpacity=".09" />
                <stop offset="1" stopColor="#fff" stopOpacity=".02" />
              </linearGradient>
            </defs>
            <text
              x="600"
              y="200"
              textAnchor="middle"
              textLength="1180"
              lengthAdjust="spacingAndGlyphs"
              fill="url(#site-footer-fade)"
              className="font-brand text-[200px] font-bold tracking-[-2px]"
            >
              NIVOMI AI
            </text>
          </svg>
        </div>
      </div>
    </footer>
  );
}
