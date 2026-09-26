import { fileURLToPath } from 'node:url';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // esbuild cannot emit decorator metadata, which NestJS dependency injection
  // requires; SWC can.
  plugins: [swc.vite()],
  resolve: {
    alias: {
      '@nivomi/config': fileURLToPath(
        new URL('../../packages/config/src/index.ts', import.meta.url),
      ),
      '@nivomi/database': fileURLToPath(
        new URL('../../packages/database/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // Each integration file boots the app on an in-memory PostgreSQL (~400 MB); keep one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
