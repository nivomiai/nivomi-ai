import { expect, test } from '@playwright/test';
import { PASSWORD, linkFromEmail, signIn, signUpAndVerify, uniqueEmail } from './helpers.js';

test.describe('customer app', () => {
  test('signed-out visitors are sent to sign-in', async ({ page }) => {
    await page.goto('/app/team');
    await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Fteam$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
  });

  test('website → sign-up → verify → organization → dashboard → team', async ({ page }) => {
    const email = uniqueEmail('owner');

    await page.goto('/');
    await page.getByRole('link', { name: 'Login' }).first().click();
    await expect(page).toHaveURL(/\/login$/);

    await signUpAndVerify(page, 'Priya Nair', email);
    await signIn(page, email);

    // First sign-in with no organization lands on setup.
    await expect(page.getByRole('heading', { name: 'Set up your organization' })).toBeVisible();
    await page.getByLabel('Organization name').fill('Sunrise Realty');
    await page.getByRole('button', { name: 'Create organization' }).click();

    await expect(page.getByRole('heading', { name: 'Welcome, Priya' })).toBeVisible();
    await expect(page.getByText('awaiting approval by the Nivomi team')).toBeVisible();

    await page.getByRole('link', { name: 'Team' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Team' })).toBeVisible();
    await expect(page.getByRole('main').getByText(email)).toBeVisible();

    const teammate = uniqueEmail('agent');
    await page.getByLabel('Email', { exact: true }).fill(teammate);
    await page.getByRole('button', { name: 'Send invite' }).click();
    await expect(page.getByText(`Invitation sent to ${teammate}.`)).toBeVisible();

    await page.getByRole('link', { name: 'Audit log' }).click();
    await expect(page.getByText('Invited a member')).toBeVisible();
    await expect(page.getByText('Created the organization')).toBeVisible();

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/app');
    await expect(page).toHaveURL(/\/login\?next=/);
  });

  test('an invited teammate joins with the invited role', async ({ page, browser }) => {
    const ownerEmail = uniqueEmail('owner2');
    await signUpAndVerify(page, 'Arjun Menon', ownerEmail);
    await signIn(page, ownerEmail);
    await page.getByLabel('Organization name').fill('Coastal Homes');
    await page.getByRole('button', { name: 'Create organization' }).click();
    await expect(page.getByRole('heading', { name: 'Welcome, Arjun' })).toBeVisible();

    const agentEmail = uniqueEmail('agent2');
    await page.getByRole('link', { name: 'Team' }).click();
    await page.getByLabel('Email', { exact: true }).fill(agentEmail);
    await page.getByRole('button', { name: 'Send invite' }).click();
    await expect(page.getByText(`Invitation sent to ${agentEmail}.`)).toBeVisible();
    const invite = await linkFromEmail(agentEmail, 'invitation');

    const context = await browser.newContext();
    const agent = await context.newPage();
    await signUpAndVerify(agent, 'Meera Das', agentEmail);
    await agent.goto(invite);
    await agent.getByRole('link', { name: 'Sign in to accept' }).click();
    await agent.getByLabel('Work email').fill(agentEmail);
    await agent.getByLabel('Password').fill(PASSWORD);
    await agent.getByRole('button', { name: 'Sign in' }).click();
    await agent.getByRole('button', { name: 'Accept invitation' }).click();
    await expect(agent.getByRole('heading', { name: 'You joined Coastal Homes' })).toBeVisible();
    await agent.getByRole('link', { name: 'Open Coastal Homes' }).click();

    await expect(agent.getByRole('heading', { name: 'Welcome, Meera' })).toBeVisible();
    // Agents do not administer the team or read the audit log.
    await expect(agent.getByRole('link', { name: 'Team' })).toHaveCount(0);
    await expect(agent.getByRole('link', { name: 'Audit log' })).toHaveCount(0);
    await context.close();
  });

  test('shows a safe message for wrong credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Work email').fill(uniqueEmail('nobody'));
    await page.getByLabel('Password').fill('wrong password 123');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('form').getByRole('alert')).toContainText(
      'Email or password is incorrect.',
    );
  });
});
