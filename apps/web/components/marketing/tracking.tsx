'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useEffect, useRef } from 'react';
import { type AnalyticsEvent, type AnalyticsProps, track } from '@/lib/site/analytics';

/**
 * Link to a page or a section. A section on the current page (`#id` or `/current#id`) renders a
 * native anchor: Next.js client navigation updates the hash with `pushState`, which does not
 * fire `hashchange`, and the lead form reads its preselected intent from the hash.
 */
export function SectionLink({
  href,
  className,
  onClick,
  children,
}: {
  readonly href: string;
  readonly className?: string | undefined;
  readonly onClick?: (() => void) | undefined;
  readonly children: ReactNode;
}) {
  const pathname = usePathname();
  const extra = {
    ...(className === undefined ? {} : { className }),
    ...(onClick === undefined ? {} : { onClick }),
  };
  const hashAt = href.indexOf('#');
  const path = hashAt === -1 ? href : href.slice(0, hashAt);
  if (hashAt !== -1 && (path === '' || path === pathname)) {
    return (
      <a href={href.slice(hashAt)} {...extra}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} {...extra}>
      {children}
    </Link>
  );
}

/** Link that records a (non-personal) analytics event when clicked. */
export function TrackedLink({
  href,
  event,
  props,
  className,
  children,
}: {
  readonly href: string;
  readonly event: AnalyticsEvent;
  readonly props?: AnalyticsProps;
  readonly className?: string | undefined;
  readonly children: ReactNode;
}) {
  return (
    <SectionLink href={href} className={className} onClick={() => track(event, props)}>
      {children}
    </SectionLink>
  );
}

/** Records an event once, the first time the marker scrolls into view. */
export function TrackOnView({
  event,
  props,
}: {
  readonly event: AnalyticsEvent;
  readonly props?: AnalyticsProps;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const propsKey = JSON.stringify(props ?? {});
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          track(event, JSON.parse(propsKey) as AnalyticsProps);
          observer.disconnect();
        }
      },
      { threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [event, propsKey]);
  return <span ref={ref} aria-hidden="true" className="block h-px w-full" />;
}
