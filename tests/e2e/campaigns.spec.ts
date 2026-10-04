import { expect, test } from '@playwright/test';

/** Seeded by `apps/api/src/dev/seed.ts` before the e2e API starts (see playwright.config.ts). */
const DEMO_OWNER = 'admin@example.com';
const DEV_PASSWORD = 'nivomi-dev-admin';

test.describe('campaigns and eligibility', () => {
  test('create, check and launch a campaign against the simulated dialer, seeing BLOCKED reasons', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByLabel('Work email').fill(DEMO_OWNER);
    await page.getByLabel('Password').fill(DEV_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    const campaignsLink = page.getByRole('link', { name: 'Campaigns', exact: true });
    const choose = page.getByRole('heading', { name: 'Choose an organization' });
    await expect(campaignsLink.or(choose)).toBeVisible();
    if (await choose.isVisible()) await page.getByRole('button', { name: /Nivomi Demo/ }).click();

    await campaignsLink.click();
    await expect(page.getByRole('heading', { level: 1, name: 'Campaigns' })).toBeVisible();
    // The India rules are drafts until counsel reviews them.
    await expect(page.getByText('draft pending legal review')).toBeVisible();

    const name = `E2E site-visit calls ${Date.now()}`;
    await page.getByRole('link', { name: 'New campaign' }).click();
    await page.getByLabel('Name').fill(name);
    await page.getByLabel('Caller number').selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Create campaign' }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(page.getByText('Draft', { exact: true })).toBeVisible();

    // FR-36: the dry run shows who cannot be called, and why.
    await page.getByRole('button', { name: 'Run pre-launch check' }).click();
    await expect(page.getByText(/leads checked/)).toBeVisible({ timeout: 20_000 });
    for (const code of ['NO_CONSENT_BASIS', 'DND_REGISTERED', 'LEAD_DO_NOT_CALL', 'SUPPRESSED']) {
      await expect(page.getByText(code, { exact: true })).toBeVisible();
    }

    await page.getByRole('button', { name: 'Launch' }).click();
    await expect(page.getByText('Running', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Progress' })).toBeVisible();
    // Each lead is listed with the reason it cannot be called (re-checked before any dial).
    await expect(page.getByRole('heading', { name: 'Leads', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: /Marked Do not call/ }).first()).toBeVisible();
    await expect(page.getByRole('cell', { name: /No consent basis/ }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Stop for good' }).click();
    await expect(page.getByText('Stopped', { exact: true })).toBeVisible();
  });
});
