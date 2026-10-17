import { expect, test } from '@playwright/test';
import { chooseOption } from './helpers.js';

const SUPER_ADMIN_EMAIL = 'admin@example.com';
const PLAIN_MEMBER_EMAIL = 'kavya.viewer@example.com';
const DEV_PASSWORD = 'nivomi-dev-admin';

async function signIn(page: import('@playwright/test').Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password').fill(DEV_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /^Welcome/ })).toBeVisible();
}

test.describe('Super Admin console', () => {
  test('a plain member cannot see the Platform section', async ({ page }) => {
    await signIn(page, PLAIN_MEMBER_EMAIL);
    await expect(page.getByRole('navigation', { name: 'Platform (Super Admin)' })).toHaveCount(0);
    // The screen refuses too, even by direct URL.
    await page.goto('/app/platform/organizations');
    await expect(page.getByText('Super Admin only')).toBeVisible();
  });

  test('Super Admin sees Platform nav and lists organizations', async ({ page }) => {
    await signIn(page, SUPER_ADMIN_EMAIL);
    const platformNav = page.getByRole('navigation', { name: 'Platform (Super Admin)' });
    await expect(platformNav.getByRole('link', { name: 'Organizations' })).toBeVisible();
    await platformNav.getByRole('link', { name: 'Organizations' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Organizations' })).toBeVisible();
    // Seeded orgs from apps/api/src/dev/seed-data.ts.
    await expect(page.getByRole('heading', { level: 3, name: 'Nivomi Demo' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'Coastal Homes' })).toBeVisible();

    // Filter narrows the list.
    await chooseOption(page.getByLabel('Status'), 'PENDING_APPROVAL');
    await expect(page.getByRole('heading', { level: 3, name: 'Coastal Homes' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'Nivomi Demo' })).toHaveCount(0);
  });

  test('the platform audit page opens for Super Admin only', async ({ page }) => {
    await signIn(page, SUPER_ADMIN_EMAIL);
    await page.goto('/app/platform/audit');
    await expect(page.getByRole('heading', { level: 1, name: 'Platform audit' })).toBeVisible();
  });
});
