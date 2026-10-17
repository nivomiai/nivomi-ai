import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { type Locator, type Page, expect } from '@playwright/test';
import { E2E_MAILBOX_DIR } from '../../playwright.config.js';

export const PASSWORD = 'e2e correct horse battery';

interface StoredEmail {
  to: string;
  category: string;
  text: string;
}

/** Waits for the worker to deliver an email and returns the link inside it. */
export async function linkFromEmail(to: string, category: string): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(
      () => {
        let files: string[] = [];
        try {
          files = readdirSync(E2E_MAILBOX_DIR).sort();
        } catch {
          return undefined;
        }
        const email = files
          .map((f) => JSON.parse(readFileSync(join(E2E_MAILBOX_DIR, f), 'utf8')) as StoredEmail)
          .filter((e) => e.to === to && e.category === category)
          .at(-1);
        link = email?.text.match(/https?:\/\/\S+token=[\w-]+/)?.[0];
        return link;
      },
      { timeout: 15_000 },
    )
    .toBeTruthy();
  return link ?? '';
}

export function uniqueEmail(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

export async function signUpAndVerify(page: Page, name: string, email: string): Promise<void> {
  await page.goto('/signup');
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();

  await page.goto(await linkFromEmail(email, 'verify-email'));
  await expect(page.getByRole('heading', { name: 'Email verified' })).toBeVisible();
}

export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

/**
 * Picks an option in the app's custom dropdown (`components/app/Select.tsx`): opens the
 * combobox, then clicks the option with that value, or the option at `{ index }`.
 */
export async function chooseOption(
  combobox: Locator,
  option: string | { readonly index: number },
): Promise<void> {
  await combobox.click();
  const list = combobox.page().getByRole('listbox');
  const target =
    typeof option === 'string'
      ? list.locator(`[data-value="${option}"]`)
      : list.getByRole('option').nth(option.index);
  await target.click();
  await expect(list).toBeHidden();
}

/** Answers the one-time welcome survey a new account sees on first entering the app. */
export async function answerWelcomeSurvey(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'Welcome to Nivomi' });
  await chooseOption(dialog.getByLabel('What best describes you?'), 'business_owner');
  await chooseOption(dialog.getByLabel('Expected monthly call volume'), 'not_sure');
  await chooseOption(dialog.getByLabel('Are you migrating from another provider?'), 'new');
  await chooseOption(dialog.getByLabel('How did you hear about us?'), 'search');
  await dialog.getByRole('button', { name: 'Get started' }).click();
  await expect(dialog).toBeHidden();
}

/** A new verified owner with an organization, signed in on `page`. */
export async function ownerWithOrganization(page: Page, name: string, organization: string) {
  const email = uniqueEmail('owner');
  await signUpAndVerify(page, name, email);
  await signIn(page, email);
  await page.getByLabel('Organization name').fill(organization);
  await page.getByRole('button', { name: 'Create organization' }).click();
  await answerWelcomeSurvey(page);
  await expect(
    page.getByRole('heading', { name: `Welcome, ${name.split(' ')[0] ?? name}` }),
  ).toBeVisible();
  return email;
}
