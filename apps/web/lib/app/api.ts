'use client';

import { createApiClient } from '../api/client';

/** Where to send someone whose session can no longer be renewed. */
export function loginUrl(next?: string): string {
  const target = next ?? (typeof window === 'undefined' ? '/app' : window.location.pathname);
  return `/login?next=${encodeURIComponent(safeNext(target))}`;
}

/** Only same-app relative paths are allowed as post-login destinations (no open redirects). */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return '/app';
  }
  return next.startsWith('/app') || next.startsWith('/invite') ? next : '/app';
}

export const api = createApiClient({
  onSessionExpired: () => {
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/app')) {
      window.location.assign(loginUrl());
    }
  },
});
