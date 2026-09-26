import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type DatabaseHandle, createDatabase } from './client.js';
import { organizationInvitations, organizations, users } from './schema/index.js';

describe('database (PGlite + committed migrations)', () => {
  let handle: DatabaseHandle;

  beforeAll(async () => {
    handle = await createDatabase({ kind: 'pglite' });
    await handle.migrate();
  });

  afterAll(async () => {
    await handle.close();
  });

  it('applies the migrations and answers a ping', async () => {
    await expect(handle.ping()).resolves.toBeUndefined();
    const result = await handle.db.execute(
      sql`select table_name from information_schema.tables where table_schema = 'public' order by 1`,
    );
    const { rows } = result as { rows: { table_name: string }[] };
    expect(rows.map((r) => r.table_name)).toEqual(
      expect.arrayContaining(['users', 'sessions', 'organizations', 'audit_logs', 'jobs']),
    );
  });

  it('enforces a unique email', async () => {
    const values = { email: 'a@example.in', name: 'A', passwordHash: 'x' };
    await handle.db.insert(users).values(values);
    await expect(handle.db.insert(users).values(values)).rejects.toThrow();
  });

  it('allows only one open invitation per email per organization', async () => {
    const [org] = await handle.db
      .insert(organizations)
      .values({ name: 'Org', slug: 'org' })
      .returning();
    const invite = {
      organizationId: org!.id,
      email: 'b@example.in',
      role: 'VIEWER' as const,
      expiresAt: new Date(Date.now() + 60_000),
    };
    await handle.db.insert(organizationInvitations).values({ ...invite, tokenHash: 'h1' });
    await expect(
      handle.db.insert(organizationInvitations).values({ ...invite, tokenHash: 'h2' }),
    ).rejects.toThrow();

    await handle.db
      .update(organizationInvitations)
      .set({ revokedAt: new Date() })
      .where(eq(organizationInvitations.tokenHash, 'h1'));
    await expect(
      handle.db.insert(organizationInvitations).values({ ...invite, tokenHash: 'h3' }),
    ).resolves.toBeDefined();
  });
});
