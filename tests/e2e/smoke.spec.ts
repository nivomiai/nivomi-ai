import { expect, test } from '@playwright/test';
import { API_URL } from '../../playwright.config.js';

test.describe('smoke', () => {
  test('API reports liveness', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/v1/health`);

    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ok', version: 'e2e' });
    expect(res.headers()['x-request-id']).toBeTruthy();
  });

  test('web app renders with security headers', async ({ page }) => {
    const res = await page.goto('/');

    expect(res?.status()).toBe(200);
    await expect(
      page.getByRole('heading', { level: 1, name: 'AI Managers for Your Business' }),
    ).toBeVisible();

    const headers = res?.headers() ?? {};
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-powered-by']).toBeUndefined();
  });
});
