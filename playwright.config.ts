import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { defineConfig, devices } from '@playwright/test';

const API_URL = 'http://localhost:4000';
const WEB_URL = 'http://localhost:3000';
/** The API's development mailbox; e2e tests read verification links from it. */
const E2E_MAILBOX_DIR = join(tmpdir(), 'nivomi-e2e-mailbox');

/**
 * End-to-end tests run against the production builds of every app (`npm run build` first).
 * The API runs with NODE_ENV=test: production mode requires RDS and SES, which e2e replaces
 * with in-memory PostgreSQL (PGlite) and the file mailbox. Cookies are therefore not `Secure`
 * over plain http here.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run start -w @nivomi/api',
      url: `${API_URL}/api/v1/health`,
      reuseExistingServer: !process.env.CI,
      env: {
        NODE_ENV: 'test',
        PORT: '4000',
        LOG_LEVEL: 'warn',
        CORS_ALLOWED_ORIGINS: WEB_URL,
        APP_WEB_URL: WEB_URL,
        APP_VERSION: 'e2e',
        // Generated per run; never a committed value.
        AUTH_JWT_SECRET: randomBytes(32).toString('base64url'),
        DATABASE_PGLITE_DIR: 'memory',
        EMAIL_PROVIDER: 'dev-mailbox',
        EMAIL_DEV_MAILBOX_DIR: E2E_MAILBOX_DIR,
        WORKER_ENABLED: 'true',
      },
    },
    {
      command: 'npm run start -w @nivomi/web',
      url: WEB_URL,
      reuseExistingServer: !process.env.CI,
      // Stands in for the production load-balancer rule that routes /api/v1 to the API.
      // 127.0.0.1, not localhost: Node resolves localhost to ::1 first and the API binds IPv4.
      env: { NIVOMI_API_ORIGIN: 'http://127.0.0.1:4000' },
    },
  ],
});

export { API_URL, E2E_MAILBOX_DIR };
