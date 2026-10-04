import { expect, test } from '@playwright/test';

/** Seeded by `apps/api/src/dev/seed.ts` before the e2e API starts (see playwright.config.ts). */
const DEMO_OWNER = 'admin@example.com';
const DEV_PASSWORD = 'nivomi-dev-admin';

test.describe('dashboard and call queue', () => {
  test('the dashboard shows today, the funnel and attention items; the call queue filters', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByLabel('Work email').fill(DEMO_OWNER);
    await page.getByLabel('Password').fill(DEV_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    const dashboard = page.getByRole('link', { name: 'Dashboard', exact: true });
    const choose = page.getByRole('heading', { name: 'Choose an organization' });
    await expect(dashboard.or(choose)).toBeVisible();
    if (await choose.isVisible()) await page.getByRole('button', { name: /Nivomi Demo/ }).click();

    // Navigation is grouped like the MVP mock-up.
    const nav = page.getByRole('navigation', { name: 'App' });
    for (const group of ['Overview', 'AI & Automation', 'Operations', 'Administration']) {
      await expect(nav.getByText(group, { exact: true })).toBeVisible();
    }

    await dashboard.click();
    await expect(page.getByText('Calls today')).toBeVisible();
    await expect(page.getByText('Answer rate')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Call funnel' })).toBeVisible();
    await expect(
      page.getByRole('list', { name: 'Call funnel, today' }).getByRole('listitem'),
    ).toHaveCount(5);
    await expect(page.getByRole('heading', { name: 'Attention required' })).toBeVisible();

    await page.getByRole('link', { name: 'Call queue', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Call queue' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Up next' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: 'Blocked' }).click();
    await expect(page.getByRole('button', { name: 'Blocked' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
