import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('brand profiles and automated poster studio complete an end-to-end job', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/signup');
  await page.getByLabel('Your name').fill('Poster Studio');
  await page.getByLabel('Email address').fill(`poster-${Date.now()}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill('a-safe-password-123');
  await page.getByRole('button', { name: 'Create your workspace' }).click();
  await page.getByRole('button', { name: 'I’ve saved them' }).click();
  await page.goto('/settings');
  await page
    .locator('[data-provider="openai"]')
    .getByLabel('Add provider API key')
    .fill('sk-browser-poster-test-only');
  await page.locator('[data-provider="openai"]').getByRole('button', { name: 'Save key' }).click();
  await expect(page.getByText('KEY SAVED', { exact: true })).toBeVisible();
  await page.goto('/brands');
  await page.getByLabel('Brand name', { exact: true }).fill('The Botanical Institute');
  await page.getByLabel('Brand tagline').fill('A different kind of future.');
  await page.getByRole('button', { name: 'Save brand profile' }).click();
  await expect(page.locator('.brand-card')).toContainText('The Botanical Institute');
  await page.goto('/posters');
  await page.getByRole('button', { name: 'Start with an example' }).click();
  await page
    .getByLabel('Brand profile', { exact: true })
    .selectOption({ label: 'The Botanical Institute' });
  await page.getByRole('button', { name: 'Create finished poster' }).click();
  await expect(page.locator('#poster-state')).toHaveText('READY', { timeout: 15000 });
  await expect(page.locator('#poster-preview img')).toBeVisible();
  await expect(page.getByText('READABILITY CHECKS PASSED', { exact: true })).toBeVisible();
  await expect(page.locator('#poster-downloads a')).toHaveCount(3);
  await expect(page.locator('#poster-job-list tbody tr')).toHaveCount(1);
  await page.screenshot({
    path: test.info().outputPath('poster-studio-desktop.png'),
    fullPage: true,
  });
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(result.violations).toEqual([]);
  await page.reload();
  await expect(page.locator('#poster-preview img')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['/posters', '/brands']) {
    await page.goto(route);
    await expect(page.locator('h1')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
  }
  await page.goto('/posters');
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('#poster-job-list tbody')).toContainText('deleted');
  expect(errors).toEqual([]);
});
