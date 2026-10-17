import { expect, test, type Page } from '@playwright/test';

/** Seeded by `apps/api/src/dev/seed.ts` before the e2e API starts (see playwright.config.ts). */
const DEMO_OWNER = 'admin@example.com';
const DEV_PASSWORD = 'nivomi-dev-admin';

async function signInAsDemoOwner(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Work email').fill(DEMO_OWNER);
  await page.getByLabel('Password').fill(DEV_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  const agentsLink = page.getByRole('link', { name: 'AI Agents', exact: true });
  const choose = page.getByRole('heading', { name: 'Choose an organization' });
  await expect(agentsLink.or(choose)).toBeVisible();
  if (await choose.isVisible()) await page.getByRole('button', { name: /Nivomi Demo/ }).click();
  return agentsLink;
}

test.describe('AI agents', () => {
  test('create an agent, edit a step in the workflow builder, publish it and test-chat with it', async ({
    page,
  }) => {
    const agentsLink = await signInAsDemoOwner(page);
    await agentsLink.click();
    await expect(page.getByRole('heading', { level: 1, name: 'AI Agents' })).toBeVisible();

    const name = `E2E agent ${Date.now()}`;
    await page.getByLabel('Agent name').fill(name);
    await page.getByRole('button', { name: 'Create agent' }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();

    // The starter workflow is on the canvas; selecting a step opens its editor.
    const canvas = page.getByLabel('Conversation workflow canvas');
    await canvas.getByText('Would you like to hear more about it?').click();
    await expect(page.getByLabel('Question', { exact: true })).toHaveValue(
      'Would you like to hear more about it?',
    );
    await page
      .getByLabel('Question', { exact: true })
      .fill('Shall I tell you about the new towers?');
    await expect(canvas.getByText('Shall I tell you about the new towers?')).toBeVisible();

    await page.getByRole('button', { name: 'Publish new version' }).click();
    await expect(page.getByText('Version 1 is published. Campaigns can now use it.')).toBeVisible();

    // Test chat walks the workflow: platform opening first, then the edited question.
    await page.getByRole('tab', { name: 'Test chat' }).click();
    await page.getByRole('button', { name: 'Start test chat' }).click();
    const conversation = page.getByRole('list', { name: 'Conversation' });
    await expect(
      conversation.getByText(/an AI assistant calling on behalf of Nivomi Demo/),
    ).toBeVisible();
    await expect(conversation.getByText('Shall I tell you about the new towers?')).toBeVisible();

    await page.getByLabel('The person says').fill('Yes please');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(conversation.getByText(/\(Simulated AI\)/)).toBeVisible();

    // An opt-out always ends the call, whatever the workflow says.
    await page.getByLabel('The person says').fill("Please don't call me again");
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText('Call ended · Opted out')).toBeVisible();
  });
});
