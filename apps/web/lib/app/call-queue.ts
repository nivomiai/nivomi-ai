/**
 * Call queue filters, shared by the server page (which reads `?filter=`) and the client screen.
 * Kept out of the client component: a server component cannot read values exported from a
 * 'use client' module.
 */
export const QUEUE_FILTERS = ['upcoming', 'review', 'blocked', 'all'] as const;
export type QueueFilter = (typeof QUEUE_FILTERS)[number];

export function parseQueueFilter(value: string | string[] | undefined): QueueFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  return (QUEUE_FILTERS as readonly string[]).includes(raw ?? '')
    ? (raw as QueueFilter)
    : 'upcoming';
}
