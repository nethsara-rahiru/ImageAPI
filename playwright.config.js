import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  testMatch: '**/*.spec.js',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: 'http://127.0.0.1:8765',
    reducedMotion: 'reduce',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    launchOptions: process.env.IMAGEAPI_CHROMIUM_PATH
      ? { executablePath: process.env.IMAGEAPI_CHROMIUM_PATH }
      : {},
  },
  webServer: {
    command: 'node tests/browser/server.js',
    url: 'http://127.0.0.1:8765/health',
    reuseExistingServer: false,
    timeout: 30000,
  },
});
