import { expect, test } from '@playwright/test';
import path from 'node:path';

const SAMPLE = path.resolve(__dirname, '../../../samples/products-sample.csv');

test('register → create project → upload file → review and export results', async ({ page }) => {
  const email = `ui-${Date.now()}@example.test`;

  await page.goto('/register');
  await page.getByLabel('Full name').fill('UI Tester');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password').fill('CorrectHorse42');
  await page.getByLabel('Company name').fill('Smoke Test Ltd');
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL(/\/overview/);
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();

  // Session survives a reload (refresh-token cookie → new access token).
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();

  await page.getByRole('link', { name: 'Projects' }).click();
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByLabel('Name').fill('Smoke project');
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('heading', { name: /Smoke project/ })).toBeVisible();

  await page.getByTestId('file-input').setInputFiles(SAMPLE);
  await expect(page.getByText('6 valid')).toBeVisible();
  await expect(page.getByText('2 duplicate')).toBeVisible();
  await expect(page.getByText('3 invalid')).toBeVisible();

  await page.getByRole('link', { name: 'products-sample.csv' }).click();
  await expect(page.getByText('Import completed: 6 valid, 2 duplicate, 3 invalid')).toBeVisible();

  await page.getByRole('tab', { name: 'Duplicates' }).click();
  await expect(page.getByRole('cell', { name: 'Duplicate of row 2' })).toBeVisible();

  await page.getByPlaceholder('Search URL, ASIN or issue').fill('B0C1234567');
  await expect(page.getByRole('link', { name: /amazon\.co\.uk\/dp\/B0C1234567/ })).toHaveCount(0); // it's not a duplicate
  await page.getByRole('tab', { name: 'All' }).click();
  await expect(page.getByRole('link', { name: /amazon\.co\.uk\/dp\/B0C1234567/ })).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Valid URLs' }).click();
  const file = await downloadPromise;
  expect(file.suggestedFilename()).toMatch(/products-sample-valid-.*\.xlsx$/);

  await page.getByRole('link', { name: 'Exported Reports' }).click();
  await expect(page.getByRole('cell', { name: /products-sample-valid/ })).toBeVisible();

  await page.getByRole('link', { name: 'Activity Logs' }).click();
  await expect(page.getByRole('cell', { name: 'Import uploaded' })).toBeVisible();
});

test('unauthenticated users are sent to login', async ({ page }) => {
  await page.goto('/projects');
  await expect(page).toHaveURL(/\/login/);
});
