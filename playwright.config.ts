import { defineConfig, devices } from '@playwright/test';

/** Second dev server in AUTH_MODE=supabase (Supabase URL unreachable on purpose), used by `*.supabase.spec.ts`. */
export const SUPABASE_BASE_URL = 'http://localhost:3101';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1, // tests share one in-memory database
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'iphone', use: { ...devices['iPhone 14'] }, testIgnore: /\.supabase\.spec\.ts$/ },
  ],
  webServer: [
    {
      command: 'pnpm dev:e2e',
      url: 'http://localhost:3100/login',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      command: 'pnpm dev:e2e:supabase',
      url: `${SUPABASE_BASE_URL}/login`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
