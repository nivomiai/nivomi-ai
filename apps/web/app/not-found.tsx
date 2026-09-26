import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteShell } from '@/components/marketing/SiteShell';

export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <SiteShell>
      <section aria-labelledby="nf-title" className="hero-glow">
        <div className="container-nv grid min-h-[70vh] place-items-center pt-32 pb-24 text-center">
          <div>
            <p className="eyebrow">404</p>
            <h1 id="nf-title" className="mt-4 text-4xl tracking-[-0.03em] text-ink">
              This page doesn’t exist.
            </h1>
            <p className="lede mx-auto mt-4 max-w-md">
              The link may be out of date. Head back to the homepage to explore Nivomi.
            </p>
            <Link href="/" className="btn btn-primary mt-8">
              Go to the homepage
            </Link>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
