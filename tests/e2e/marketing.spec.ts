import { type Page, expect, test } from '@playwright/test';

test.describe('public website routes', () => {
  for (const path of ['/', '/privacy', '/terms', '/login']) {
    test(`${path} renders with exactly one h1`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page.locator('h1')).toHaveCount(1);
    });
  }

  test('legal pages carry the legal-review warning', async ({ page }) => {
    for (const path of ['/privacy', '/terms']) {
      await page.goto(path);
      await expect(page.getByText('Legal review required before production launch')).toBeVisible();
    }
  });

  test('robots and sitemap are served, sitemap holds only the public pages', async ({
    request,
  }) => {
    expect((await request.get('/robots.txt')).status()).toBe(200);
    const sitemap = await (await request.get('/sitemap.xml')).text();
    expect(sitemap).toContain('/privacy');
    expect(sitemap).toContain('/terms');
    expect(sitemap).not.toContain('/coming-soon');
  });
});

test.describe('homepage (nivomiai/website page)', () => {
  test('is the website page, with a Login button into the app', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('NIVOMI AI — Custom AI Managers for Your Business');
    await expect(
      page.getByRole('heading', { level: 1, name: 'AI Managers for Your Business' }),
    ).toBeVisible();
    const login = page.getByRole('banner').getByRole('link', { name: 'Login' });
    await expect(login).toHaveAttribute('href', '/login');
    await login.click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
  });

  test('no internal link points to a bare #, and legal links resolve', async ({
    page,
    request,
  }) => {
    await page.goto('/');
    await expect(page.locator('a[href="#"]')).toHaveCount(0);
    for (const name of ['Privacy', 'Terms']) {
      const href = await page
        .getByRole('navigation', { name: 'Legal' })
        .getByRole('link', { name })
        .getAttribute('href');
      expect((await request.get(href ?? '')).status()).toBe(200);
    }
  });

  test('the demo form hands the details to WhatsApp', async ({ page }) => {
    await stubWindowOpen(page, 'opened');
    await page.goto('/#demo');
    const form = page.locator('#demoForm');
    await form.getByLabel('Your name').fill('Priya Nair');
    await form.getByLabel('Phone / WhatsApp').fill('+91 98765 43210');
    await form.getByRole('button', { name: 'Book a Demo' }).click();
    const opened = await page.evaluate(
      () => (window as unknown as { __opened: string[] }).__opened,
    );
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
    expect(decodeURIComponent(opened[0] ?? '')).toContain('Name: Priya Nair');
  });
});

async function stubWindowOpen(page: Page, result: 'opened' | 'blocked') {
  await page.addInitScript((mode) => {
    const w = window as unknown as { __opened: string[] };
    w.__opened = [];
    window.open = (url?: string | URL) => {
      w.__opened.push(String(url));
      return mode === 'opened' ? ({} as Window) : null;
    };
  }, result);
}

test.describe('navigation, theme and layout', () => {
  // The homepage is the website repo's page; /privacy uses the React site shell, which mirrors
  // its header and footer.
  const SHELLS = [
    { path: '/', menuLink: 'Plans' },
    { path: '/privacy', menuLink: 'Plans' },
  ] as const;

  for (const { path, menuLink } of SHELLS) {
    test(`${path} mobile menu opens, is keyboard-closable and returns focus`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 800 });
      await page.goto(path);
      const button = page.getByRole('button', { name: 'Open menu' });
      await button.click();
      await expect(page.getByRole('button', { name: 'Close menu' })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      await expect(
        page.getByRole('navigation', { name: 'Mobile' }).getByRole('link', { name: menuLink }),
      ).toBeVisible();
      await expect(
        page.locator('#mobileMenu, #mobile-menu').getByRole('link', { name: 'Login' }),
      ).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('navigation', { name: 'Mobile' })).toBeHidden();
      await expect(page.getByRole('button', { name: 'Open menu' })).toBeFocused();
    });
  }

  for (const { path } of SHELLS) {
    test(`${path} theme defaults to dark and the choice persists across reloads`, async ({
      page,
    }) => {
      await page.goto(path);
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await page.getByRole('button', { name: 'Switch to light mode' }).first().click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    });
  }

  for (const path of ['/', '/privacy']) {
    test(`${path} has no horizontal overflow at 375px`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 800 });
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
