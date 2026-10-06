import { expect, test } from '@playwright/test';

/**
 * The homepage pricing tiles start with a hardcoded fallback and then fetch
 * `/api/v1/plans/public` to replace them. A failed fetch must leave the
 * fallback in place rather than crashing the page.
 */
test.describe('homepage pricing is driven by /api/v1/plans/public', () => {
  test('live API prices overwrite the hardcoded fallback', async ({ page }) => {
    await page.route('**/api/v1/plans/public', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              code: 'starter',
              name: 'Starter',
              monthlyPaiseInr: 199900,
              annualPaiseInr: 1919040, // 199900 × 12 × 0.80
              annualDiscountBps: 2000,
              limits: { CALL_MINUTES_OUTBOUND: 2000 },
              displayOrder: 10,
            },
            {
              code: 'organisation',
              name: 'Organisation',
              monthlyPaiseInr: 999900,
              annualPaiseInr: 9599040, // 999900 × 12 × 0.80
              annualDiscountBps: 2000,
              limits: { CALL_MINUTES_OUTBOUND: 15000 },
              displayOrder: 20,
            },
          ],
        }),
      }),
    );

    await page.goto('/');
    const starter = page.locator('article.plan[data-plan="starter"]');
    const org = page.locator('article.plan[data-plan="organisation"]');
    await expect(starter.locator('.amt')).toContainText('1,999', { timeout: 5000 });
    await expect(org.locator('.amt')).toContainText('9,999', { timeout: 5000 });
    // The hardcoded "₹ —" placeholder is gone.
    await expect(starter.locator('.amt')).not.toContainText('—');
    await expect(org.locator('.amt')).not.toContainText('—');

    // Switching to Annual shows the discounted annual price.
    await page.getByRole('button', { name: 'Annual' }).click();
    await expect(starter.locator('.amt')).toContainText('19,190');
    await expect(org.locator('.amt')).toContainText('95,990');
  });

  test('a failed fetch leaves the fallback in place and does not throw', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('pageerror', (e) => consoleErrors.push(e.message));
    await page.route('**/api/v1/plans/public', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
    );
    await page.goto('/');
    // Starter card still renders with the fallback token.
    const starter = page.locator('article.plan[data-plan="starter"]');
    await expect(starter).toBeVisible();
    await expect(starter.locator('.amt')).toContainText('—');
    expect(consoleErrors).toEqual([]);
  });
});
