import { defineConfig } from 'drizzle-kit';

/** Generates SQL migrations from the schema. Migrations are committed and reviewed (ADR-008). */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  strict: true,
});
