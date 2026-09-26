/** Opaque keyset cursor over (created_at, id), newest first. Never an offset. */
export interface Keyset {
  readonly createdAt: Date;
  readonly id: string;
}

export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString('base64url');
}

export function decodeCursor(cursor: string | undefined | null): Keyset | null {
  if (!cursor) return null;
  const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  const createdAt = new Date(iso ?? '');
  return id && /^[0-9a-f-]{36}$/i.test(id) && !Number.isNaN(createdAt.getTime())
    ? { createdAt, id }
    : null;
}

/** Splits a `limit + 1` fetch into a page and the cursor for the next one. */
export function toPage<T extends { createdAt: Date; id: string }>(
  rows: T[],
  limit: number,
): { items: T[]; nextCursor: string | null } {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null,
  };
}
