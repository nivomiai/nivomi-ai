import { type Page, expect, test } from '@playwright/test';

const COMING_SOON = [
  ['whatsapp-ai', 'Nivomi WhatsApp AI Manager | Coming Soon'],
  ['sms-automation', 'Nivomi SMS Automation | Coming Soon'],
  ['operations-ai', 'Nivomi Operations AI | Coming Soon'],
  ['analytics-ai', 'Nivomi Analytics AI | Coming Soon'],
  ['hotel-automation', 'Nivomi Hotel AI Automation | Coming Soon'],
  ['logistics-automation', 'Nivomi Logistics AI Automation | Coming Soon'],
] as const;

test.describe('public website routes', () => {
  for (const path of ['/', '/privacy', '/terms', '/login']) {
    test(`${path} renders with exactly one h1`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page.locator('h1')).toHaveCount(1);
    });
  }

  for (const [slug, title] of COMING_SOON) {
    test(`/coming-soon/${slug} is a Coming Soon page with its own title`, async ({ page }) => {
      const res = await page.goto(`/coming-soon/${slug}`);
      expect(res?.status()).toBe(200);
      await expect(page).toHaveTitle(title);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('[data-status="soon"]').first()).toBeVisible();
      // The only "available" badge is the shared-platform card; the product itself is Coming Soon.
      await expect(page.locator('[data-status="mvp"]')).toHaveCount(1);
      await expect(page.locator('#connections [data-status="mvp"]')).toHaveCount(1);
      await expect(
        page.getByText('Product concept with example content — not a working feature.'),
      ).toBeVisible();
      await expect(page.locator('#faq details')).toHaveCount(3);
    });
  }

  test('unknown Coming Soon slug returns 404', async ({ page }) => {
    const res = await page.goto('/coming-soon/does-not-exist');
    expect(res?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('This page doesn’t exist.');
  });

  test('legal pages carry the legal-review warning', async ({ page }) => {
    for (const path of ['/privacy', '/terms']) {
      await page.goto(path);
      await expect(page.getByText('Legal review required before production launch')).toBeVisible();
    }
  });

  test('robots and sitemap are served', async ({ request }) => {
    expect((await request.get('/robots.txt')).status()).toBe(200);
    const sitemap = await (await request.get('/sitemap.xml')).text();
    for (const [slug] of COMING_SOON) expect(sitemap).toContain(`/coming-soon/${slug}`);
  });
});

test.describe('homepage content', () => {
  test('links to all six Coming Soon pages, and every link resolves', async ({ page, request }) => {
    await page.goto('/');
    const hrefs = await page
      .locator('#roadmap a[href^="/coming-soon/"]')
      .evaluateAll((links) => [...new Set(links.map((a) => a.getAttribute('href')))]);
    expect(hrefs.sort()).toEqual(COMING_SOON.map(([slug]) => `/coming-soon/${slug}`).sort());
    for (const href of hrefs) expect((await request.get(href ?? '')).status()).toBe(200);
  });

  test('MVP capabilities and Coming Soon items are badged distinctly', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#product [data-status="mvp"]')).toHaveCount(9);
    await expect(page.locator('#product [data-status="soon"]')).toHaveCount(0);
    await expect(page.locator('#roadmap li [data-status="soon"]')).toHaveCount(6);
  });

  test('no internal link points to a bare #', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('a[href="#"]')).toHaveCount(0);
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

async function fillValidLead(page: Page) {
  const form = page.locator('#get-started form');
  await form.getByLabel('Name').fill('Priya Nair');
  await form.getByLabel('Work email').fill('priya@example.in');
  await form.getByLabel('Company').fill('Kochi Homes');
  await form.getByLabel('Phone').fill('+91 98765 43210');
  return form;
}

test.describe('lead form', () => {
  test('shows validation errors and focuses the first invalid field', async ({ page }) => {
    await page.goto('/#contact');
    const form = page.locator('#get-started form');
    await form.getByRole('button', { name: 'Send enquiry' }).click();
    await expect(form.getByText('Please check the highlighted fields.')).toBeVisible();
    const name = form.getByLabel('Name');
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expect(name).toBeFocused();
    await name.fill('Priya');
    await expect(name).not.toHaveAttribute('aria-invalid', 'true');
  });

  test('hands a valid enquiry to WhatsApp and shows success', async ({ page }) => {
    await stubWindowOpen(page, 'opened');
    await page.goto('/#get-started');
    const form = await fillValidLead(page);
    await expect(form.getByLabel('Get started (early access)')).toBeChecked();
    await form.getByRole('button', { name: 'Send enquiry' }).click();
    await expect(page.getByText('Thanks — your details are ready to send')).toBeVisible();
    const opened = await page.evaluate(
      () => (window as unknown as { __opened: string[] }).__opened,
    );
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
    expect(decodeURIComponent(opened[0] ?? '')).toContain('Company: Kochi Homes');
  });

  test('clicking the CTAs preselects the matching intent', async ({ page }) => {
    await page.goto('/');
    await page.locator('#top').getByRole('link', { name: 'Get started' }).click();
    const form = page.locator('#get-started form');
    await expect(form.getByLabel('Get started (early access)')).toBeChecked();
    await page.getByRole('banner').getByRole('link', { name: 'Book a demo' }).click();
    await expect(form.getByLabel('Book a demo')).toBeChecked();
  });

  test('a double-click hands the enquiry off only once', async ({ page }) => {
    await stubWindowOpen(page, 'opened');
    await page.goto('/#contact');
    const form = await fillValidLead(page);
    await form.getByRole('button', { name: 'Send enquiry' }).dblclick();
    await expect(page.getByText('Thanks — your details are ready to send')).toBeVisible();
    const opened = await page.evaluate(
      () => (window as unknown as { __opened: string[] }).__opened,
    );
    expect(opened).toHaveLength(1);
  });

  test('the Coming Soon notify form names the product', async ({ page }) => {
    await stubWindowOpen(page, 'opened');
    await page.goto('/coming-soon/whatsapp-ai');
    await page.getByRole('link', { name: 'Get notified' }).click();
    const form = page.locator('#notify form');
    await form.getByLabel('Name').fill('Priya Nair');
    await form.getByLabel('Work email').fill('priya@example.in');
    await form.getByLabel('Company').fill('Kochi Homes');
    await form.getByLabel('Phone').fill('+91 98765 43210');
    await form.getByRole('button', { name: 'Send enquiry' }).click();
    await expect(page.getByText('Thanks — your details are ready to send')).toBeVisible();
    const opened = await page.evaluate(
      () => (window as unknown as { __opened: string[] }).__opened,
    );
    const text = decodeURIComponent(opened[0] ?? '');
    expect(text).toContain('Interested in an upcoming product');
    expect(text).toContain('Product: WhatsApp AI Manager');
  });

  test('offers the email fallback when the new tab is blocked', async ({ page }) => {
    await stubWindowOpen(page, 'blocked');
    await page.goto('/#contact');
    const form = await fillValidLead(page);
    await form.getByRole('button', { name: 'Send enquiry' }).click();
    const alert = form.getByRole('alert');
    await expect(alert).toContainText('We couldn’t open WhatsApp');
    await expect(alert.getByRole('link', { name: 'Send your details by email' })).toHaveAttribute(
      'href',
      /^mailto:/,
    );
    await expect(form.getByRole('button', { name: /Try again/ })).toBeEnabled();
  });
});

test.describe('navigation, theme and layout', () => {
  test('mobile menu opens, is keyboard-closable and returns focus', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/');
    const button = page.getByRole('button', { name: 'Open menu' });
    await button.click();
    await expect(page.getByRole('button', { name: 'Close menu' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expect(
      page.getByRole('navigation', { name: 'Mobile' }).getByRole('link', { name: 'Pricing' }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('navigation', { name: 'Mobile' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeFocused();
  });

  test('theme defaults to dark and the choice persists across reloads', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('button', { name: 'Switch to light theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  for (const path of ['/', '/coming-soon/whatsapp-ai', '/privacy']) {
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
