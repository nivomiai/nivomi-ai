import type { ReactNode } from 'react';
import { SignInHero } from '@/components/auth/SignInHero';
import { TextLink } from '@/components/app/ui';
import { Icon, Logo } from '@/components/marketing/primitives';

/** Split layout shared by sign-in, sign-up and forgot-password: hero on the left, the form card on the right. */
export function SignInFrame({
  lead,
  children,
}: {
  /** First line of the hero headline, before "better conversations." */
  readonly lead: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-soft">
      <header className="relative container-nv flex h-[72px] shrink-0 items-center tall:h-24">
        {/* The homepage is a static page, not a Next.js route: a full page load. */}
        <a href="/" aria-label="Nivomi AI home" className="rounded-lg">
          <Logo className="[&_span]:text-[26px] [&_svg]:h-9" />
        </a>
      </header>
      <main
        id="main"
        className="relative container-nv grid flex-1 items-start gap-12 pt-4 pb-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)] lg:items-center lg:gap-10 lg:pt-0 lg:pb-8"
      >
        <SignInHero lead={lead} />
        <div className="mx-auto w-full max-w-[560px]">{children}</div>
      </main>
    </div>
  );
}

/** The white form card on the right of `SignInFrame`. */
export function SignInCard({
  title,
  intro,
  alternate,
  secureNote = false,
  children,
}: {
  readonly title: string;
  readonly intro: string;
  /** The "New to Nivomi? / Already have an account?" switch under the form. */
  readonly alternate: { readonly prompt: string; readonly label: string; readonly href: string };
  readonly secureNote?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <div className="w-full rounded-[24px] border border-line bg-card p-7 shadow-lg sm:px-11 sm:py-8 tall:sm:px-12 tall:sm:py-10">
      <h1 className="text-[32px] tracking-[-0.03em] text-ink sm:text-[34px] tall:sm:text-[36px]">
        {title}
      </h1>
      <p className="mt-1.5 text-[15.5px] leading-relaxed text-muted sm:text-[16px]">{intro}</p>

      <div className="mt-6 tall:mt-7">{children}</div>

      <div className="mt-6 flex items-center gap-4 text-[14.5px] text-muted">
        <span aria-hidden="true" className="h-px flex-1 bg-line" />
        <span>
          {alternate.prompt} <TextLink href={alternate.href}>{alternate.label}</TextLink>
        </span>
        <span aria-hidden="true" className="h-px flex-1 bg-line" />
      </div>

      {secureNote ? (
        <p className="mt-5 flex items-center justify-center gap-2 text-[13px] text-muted">
          <Icon name="i-shield" className="size-4" />
          Secure access to your workspace
        </p>
      ) : null}
    </div>
  );
}
