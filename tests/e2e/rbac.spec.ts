import { type Page, expect, test } from '@playwright/test';

/** Seeded members of Nivomi Demo (apps/api/src/dev/seed-data.ts). */
const DEV_PASSWORD = 'nivomi-dev-admin';

async function signInAs(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password').fill(DEV_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /^Welcome/ })).toBeVisible();
}

test.describe('account-role access in the app', () => {
  test('an ORGANIZATION member can open their team', async ({ page }) => {
    await signInAs(page, 'rahul.manager@example.com');
    const menu = page.getByRole('navigation', { name: 'App' });
    await menu.getByRole('link', { name: 'Team' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Team' })).toBeVisible();
  });

  test('the roles & access screen lists the three account roles', async ({ page }) => {
    await signInAs(page, 'kavya.viewer@example.com');
    await page.goto('/app/roles');
    const matrix = page.getByRole('table');
    for (const name of ['Individual', 'Organization', 'Custom plan']) {
      await expect(matrix.getByRole('columnheader', { name: new RegExp(name) })).toBeVisible();
    }
  });
});
