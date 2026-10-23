import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('product promotion form composes offer/features and restores them from job history', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/signup');
  await page.getByLabel('Your name').fill('Product Studio');
  await page.getByLabel('Email address').fill(`product-${Date.now()}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill('a-safe-password-123');
  await page.getByRole('button', { name: 'Create your workspace' }).click();
  await page.getByRole('button', { name: 'I’ve saved them' }).click();
  await page.goto('/settings');
  const provider = page.locator('[data-provider="openai"]');
  await provider.getByLabel('Add provider API key').fill('sk-product-browser-fixture');
  await provider.getByRole('button', { name: 'Save key' }).click();
  await expect(provider.getByText('KEY SAVED', { exact: true })).toBeVisible();
  await page.goto('/posters');
  await page.getByRole('button', { name: 'Try a product promotion' }).click();
  await expect(page.getByLabel('Offer value', { exact: true })).toHaveValue('25%');
  await expect(page.getByLabel('Design direction')).toHaveValue('product');
  await page.getByRole('button', { name: 'Create finished poster' }).click();
  await expect(page.locator('#poster-state')).toHaveText('READY', { timeout: 15000 });
  await expect(page.locator('#poster-preview img')).toBeVisible();
  const library = await (await page.request.get('/v1/posters')).json();
  expect(library.jobs[0].result.full_bleed).toBe(true);
  expect(library.jobs[0].input.features).toHaveLength(3);
  expect(library.jobs[0].input.offer.value).toBe('25%');
  await page.getByRole('button', { name: 'Use content', exact: true }).click();
  await expect(page.getByLabel('Product features', { exact: true })).toHaveValue(
    'Wireless freedom\nDeep bass\nCompact design',
  );
  await expect(page.getByLabel('Offer value', { exact: true })).toHaveValue('25%');
  await expect(page.getByLabel('Exact headline')).toHaveValue('BIG SOUND.\nANYWHERE.');
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(result.violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect(errors).toEqual([]);
});
