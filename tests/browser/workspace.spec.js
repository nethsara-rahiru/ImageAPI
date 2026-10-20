import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function register(page) {
  const email = `browser-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('Your name').fill('Alex Morgan');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('a-safe-password-123');
  await page.getByRole('button', { name: 'Create your workspace' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const secrets = await page.locator('.secret-box code').allTextContents();
  await page.getByRole('button', { name: 'I’ve saved them' }).click();
  return { email, apiKey: secrets[0], recoveryCode: secrets[1] };
}

async function connectProvider(page) {
  await page.goto('/settings');
  await page.getByLabel('Add provider API key').first().fill('sk-browser-fixture-only');
  await page.getByRole('button', { name: 'Save key' }).first().click();
  await expect(page.getByText('KEY SAVED', { exact: true })).toBeVisible();
}

test('accounts, playground, bearer API, actual usage, and revocation', async ({
  page,
  request,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const account = await register(page);
  expect(account.apiKey).toMatch(/^ia_live_/);
  expect(account.recoveryCode).toMatch(/^iar_/);
  await expect(page.getByRole('heading', { name: 'A little overview.' })).toBeVisible();
  await connectProvider(page);
  await page.getByRole('link', { name: 'Playground', exact: true }).click();
  await page.getByRole('button', { name: 'Try an idea' }).click();
  await page.getByRole('button', { name: 'Generate image', exact: true }).click();
  await expect(page.getByRole('img', { name: /glass greenhouse/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download PNG' })).toBeVisible();
  const bearerResponse = await request.post('/v1/images/generations', {
    headers: { Authorization: `Bearer ${account.apiKey}` },
    data: { prompt: 'A small test landscape', provider: 'openai', model: 'gpt-image-1' },
  });
  expect(bearerResponse.status()).toBe(200);
  expect((await bearerResponse.json()).data[0].b64_json).toBeTruthy();
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await expect(page.locator('.stat-card').first().locator('.stat-value')).toContainText('2');
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await expect(page.locator('tbody')).toContainText('Playground');
  await expect(page.locator('tbody')).toContainText('API');
  await page.getByRole('link', { name: 'API keys', exact: true }).click();
  await page.getByRole('button', { name: 'Create API key', exact: true }).click();
  await page.getByLabel('Key name').fill('Weekend project');
  await page.getByRole('button', { name: 'Create key', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Your ImageAPI key');
  await page.getByRole('button', { name: 'I’ve saved them' }).click();
  await expect(page.getByText('Weekend project', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Revoke Default key' }).click();
  await page.getByRole('button', { name: 'Revoke key', exact: true }).click();
  await expect(page.getByText('Revoked', { exact: true })).toBeVisible();
  const revoked = await request.post('/v1/images/generations', {
    headers: { Authorization: `Bearer ${account.apiKey}` },
    data: { prompt: 'Not allowed' },
  });
  expect(revoked.status()).toBe(401);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  await page.getByLabel('Email address').fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill('a-safe-password-123');
  await page.getByRole('button', { name: 'Log in to your workspace' }).click();
  await expect(page.getByRole('heading', { name: 'A little overview.' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('provider requirement, recovery, and session invalidation', async ({ page }) => {
  const account = await register(page);
  await page.goto('/playground');
  await expect(page.getByRole('button', { name: 'Generate image', exact: true })).toBeDisabled();
  await expect(page.getByText('Add your OpenAI key in Settings')).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('link', { name: 'Forgot your password?' }).click();
  await page.getByLabel('Email address').fill(account.email);
  await page.getByLabel('Recovery code', { exact: true }).fill(account.recoveryCode);
  await page.getByLabel('New password', { exact: true }).fill('replacement-password-123');
  await page.getByRole('button', { name: 'Reset password' }).click();
  await expect(page.getByText('Your password is reset.')).toBeVisible();
  const replacement = await page.locator('.secret-box code').textContent();
  expect(replacement).not.toBe(account.recoveryCode);
  await page.getByRole('link', { name: 'Back to login' }).click();
  await page.getByLabel('Email address').fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill('replacement-password-123');
  await page.getByRole('button', { name: 'Log in to your workspace' }).click();
  await expect(page.getByRole('heading', { name: 'A little overview.' })).toBeVisible();
  await page.getByRole('link', { name: 'API keys', exact: true }).click();
  await expect(page.getByText('Revoked', { exact: true })).toBeVisible();
});

test('mobile layouts, navigation, and public pages', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/', '/pricing', '/login', '/signup', '/docs']) {
    await page.goto(path);
    await expect(page.locator('h1')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
  }
  await register(page);
  for (const name of ['Settings', 'API keys', 'Playground', 'Overview']) {
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.getByRole('link', { name, exact: true }).first().click();
    await expect(page.locator('h1')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
  }
});

test('public and account screens meet automated WCAG checks', async ({ page }) => {
  for (const path of ['/', '/pricing', '/login']) {
    await page.goto(path);
    await expect(page.locator('h1')).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  }
  await register(page);
  for (const path of ['/dashboard', '/api', '/settings']) {
    await page.goto(path);
    await expect(page.locator('h1')).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  }
});
