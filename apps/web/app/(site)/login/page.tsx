import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon, LogoMark, StatusBadge } from '@/components/marketing/primitives';

export const metadata: Metadata = {
  title: 'Login',
  description: 'Customer login for Nivomi AI early-access customers.',
  alternates: { canonical: '/login' },
  robots: { index: false, follow: true },
};

export default function LoginPage() {
  return (
    <section aria-labelledby="login-title" className="hero-glow">
      <div className="container-nv grid min-h-[80vh] place-items-center pt-32 pb-24">
        <div className="card-nv w-full max-w-lg p-8 text-center shadow-lg sm:p-10">
          <LogoMark className="mx-auto h-10 w-auto" />
          <StatusBadge variant="mvp" className="mt-6" />
          <h1 id="login-title" className="mt-4 text-3xl tracking-[-0.03em] text-ink">
            Customer login
          </h1>
          <p className="mt-4 text-[15.5px] leading-relaxed text-muted">
            Nivomi is in early access. Sign-in opens for pilot customers as their organisation is
            onboarded — your Nivomi contact will send you an invitation.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <Link href="/#get-started" className="btn btn-primary">
              Request early access
            </Link>
            <Link href="/#contact" className="btn btn-secondary">
              Book a demo
            </Link>
          </div>
          <Link
            href="/"
            className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-accent"
          >
            <Icon name="i-arrow" className="size-4 rotate-180" />
            Back to the homepage
          </Link>
        </div>
      </div>
    </section>
  );
}
