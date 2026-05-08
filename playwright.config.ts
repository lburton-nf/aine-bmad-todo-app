import { defineConfig, devices } from '@playwright/test';

// E2E config — drives a real Chromium against the dev stack (Vite on 5173 +
// Fastify on 3000, with Vite proxying /todos and /healthz to Fastify). The
// `webServer` block starts both runtimes if they aren't already running.

const PORT = 5173;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    // Each test gets a clean localStorage so identity is per-test.
    storageState: undefined,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
