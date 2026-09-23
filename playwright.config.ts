import { defineConfig, devices } from '@playwright/test';

const API_URL = 'http://localhost:4000';
const WEB_URL = 'http://localhost:3000';

/**
 * End-to-end smoke tests run against the production builds of every app
 * (`npm run build` first), started with production settings.
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
        NODE_ENV: 'production',
        PORT: '4000',
        LOG_LEVEL: 'warn',
        CORS_ALLOWED_ORIGINS: WEB_URL,
        APP_VERSION: 'e2e',
      },
    },
    {
      command: 'npm run start -w @nivomi/web',
      url: WEB_URL,
      reuseExistingServer: !process.env.CI,
    },
  ],
});

export { API_URL };
