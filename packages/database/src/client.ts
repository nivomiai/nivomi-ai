import { PGlite } from '@electric-sql/pglite';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres';
import { migrate as migrateNodePg } from 'drizzle-orm/node-postgres/migrator';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import * as schema from './schema/index.js';

export type Schema = typeof schema;

/** Driver-independent database handle used by every repository. */
export type Database = PgDatabase<PgQueryResultHKT, Schema>;

export type DatabaseOptions =
  | {
      /** RDS / any PostgreSQL server. */
      readonly kind: 'postgres';
      readonly url: string;
      /** Connection-pool size per process. */
      readonly poolSize?: number;
    }
  | {
      /** In-process PostgreSQL (WASM) for local development and tests. */
      readonly kind: 'pglite';
      /** Directory to persist data in; omit for an in-memory database. */
      readonly dataDir?: string;
    };

export interface DatabaseHandle {
  readonly db: Database;
  readonly kind: DatabaseOptions['kind'];
  /** Applies pending SQL migrations from `packages/database/migrations`. */
  migrate(): Promise<void>;
  /** Cheap liveness probe for readiness checks. */
  ping(): Promise<void>;
  close(): Promise<void>;
}

/** Location of the committed SQL migrations (one level above both `src/` and `dist/`). */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../migrations', import.meta.url));

export async function createDatabase(options: DatabaseOptions): Promise<DatabaseHandle> {
  if (options.kind === 'postgres') {
    const pool = new pg.Pool({
      connectionString: options.url,
      max: options.poolSize ?? 10,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      statement_timeout: 15_000,
    });
    const db = drizzleNodePg({ client: pool, schema });
    return {
      db,
      kind: 'postgres',
      migrate: () => migrateNodePg(db, { migrationsFolder: MIGRATIONS_FOLDER }),
      ping: async () => {
        await pool.query('select 1');
      },
      close: () => pool.end(),
    };
  }

  const client = options.dataDir === undefined ? new PGlite() : new PGlite(options.dataDir);
  await client.waitReady;
  const db = drizzlePglite({ client, schema });
  return {
    db,
    kind: 'pglite',
    migrate: () => migratePglite(db, { migrationsFolder: MIGRATIONS_FOLDER }),
    ping: async () => {
      await client.query('select 1');
    },
    close: () => client.close(),
  };
}
