import { expect, test } from '@playwright/test';
import { ownerWithOrganization } from './helpers.js';

test.describe('leads and data sources', () => {
  test('add a lead by hand, then import a CSV through mapping, preview and confirmation', async ({
    page,
  }) => {
    await ownerWithOrganization(page, 'Farah Khan', 'Khan Properties');

    await page.getByRole('link', { name: 'Leads', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Leads' })).toBeVisible();
    await expect(page.getByText('No leads yet')).toBeVisible();

    // Manual lead (FR-130).
    await page.getByRole('link', { name: 'Add lead' }).click();
    await page.getByLabel('Name').fill('Ishaan Verma');
    await page.getByLabel('Phone').fill('98100 12345');
    await page.getByLabel('Consent basis').selectOption('INQUIRY');
    await page.getByLabel('Evidence source').fill('Walk-in enquiry');
    await page.getByRole('button', { name: 'Save lead' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Ishaan Verma' })).toBeVisible();
    await expect(page.getByText('+91 98100 12345')).toBeVisible();

    // Status change is recorded on the timeline.
    await page.getByLabel('Status', { exact: true }).selectOption('INTERESTED');
    await page.getByRole('button', { name: 'Save status' }).click();
    await expect(page.getByText('Status New → Interested')).toBeVisible();

    // File import (FR-14).
    await page.getByRole('link', { name: 'Data sources' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Data sources' })).toBeVisible();
    await expect(
      page.getByText('Connecting HubSpot is not enabled on this workspace yet.'),
    ).toBeVisible();

    const csv = [
      'Customer Name,Mobile,Email,Project',
      'Leela Das,98200 11111,leela@example.com,Villa',
      'Omar Sheikh,+91 98200 22222,,Flat',
      'Broken Row,123,,',
    ].join('\n');
    await page.locator('#import-file').setInputFiles({
      name: 'site-enquiries.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv),
    });
    await page.getByRole('button', { name: 'Upload and map columns' }).click();

    await expect(page.getByRole('heading', { name: 'Match your columns' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByLabel('Nivomi field for column Mobile')).toHaveValue('phone');
    await page.getByLabel('Nivomi field for column Project').selectOption('custom');
    await page.getByText('Apply a consent basis to rows without one').click();
    await page.getByLabel('Where these leads came from').fill('Site visit register');
    await page.getByText('I confirm our organization holds this consent basis').click();
    await page.getByRole('button', { name: 'Preview import' }).click();

    await expect(page.getByRole('heading', { name: 'Preview' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Row 4:')).toBeVisible();
    await page.getByRole('button', { name: 'Import 2 rows' }).click();

    await expect(page.getByRole('heading', { name: 'Import complete' })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole('link', { name: 'View leads' }).click();
    await expect(page.getByRole('link', { name: 'Leela Das' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Omar Sheikh' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ishaan Verma' })).toBeVisible();

    // Search narrows the list.
    await page.getByLabel('Search').fill('Leela');
    await expect(page.getByRole('link', { name: 'Omar Sheikh' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Leela Das' })).toBeVisible();
  });
});
