import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_WEB_PORT ?? 3000);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

const SHARED_ENV = {
  NODE_ENV: 'development',
  API_PORT: '3001',
  COOKIE_SECRET: process.env.COOKIE_SECRET ?? 'dev-cookie-secret',
  DATABASE_URL:
    process.env.DATABASE_URL ??
    'postgresql://kgk:kgk_dev_password@localhost:5432/kgk?schema=public',
  REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
  CORS_ORIGINS: process.env.CORS_ORIGINS ?? `${baseURL}`,
};

export default defineConfig({
  testDir: './e2e',
  testMatch: ['**/*.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.CI
    ? [
        {
          command: 'node ../api/dist/main.js',
          port: 3001,
          env: SHARED_ENV,
          reuseExistingServer: false,
          timeout: 30_000,
        },
        {
          command: 'pnpm start',
          port: PORT,
          reuseExistingServer: false,
          timeout: 30_000,
        },
      ]
    : undefined,
});
