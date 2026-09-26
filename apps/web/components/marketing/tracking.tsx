'use client';

import Link from 'next/link';
import { type ReactNode, useEffect, useRef } from 'react';
import { type AnalyticsEvent, type AnalyticsProps, track } from '@/lib/site/analytics';

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
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <Link href={href} className={className} onClick={() => track(event, props)}>
      {children}
    </Link>
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
