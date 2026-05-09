import { defineConfig, devices } from '@playwright/test';

// E2E config — drives a real browser against the dev stack (Vite on 5173 +
// Fastify on 3000, with Vite proxying /todos and /healthz to Fastify). The
// `webServer` block starts both runtimes if they aren't already running.
//
// Default project: chromium only (keeps local dev e2e cycles fast). Set
// E2E_ALL_BROWSERS=1 (or anything truthy) to also run Firefox and WebKit —
// CI does this so PRD NFR-8 (Chrome/Firefox/Safari/Edge last-two-stable) is
// genuinely verified rather than asserted.

const PORT = 5173;
const ALL_BROWSERS = !!process.env.E2E_ALL_BROWSERS;

const projects = ALL_BROWSERS
  ? [
      { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
      { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
      { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    ]
  : [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }];

export default defineConfig({
  testDir: './e2e',
  // *.docker.spec.ts is the production smoke suite — runs against the Docker
  // container via `npm run test:e2e:docker`, not the Vite dev stack.
  testIgnore: /\.docker\.spec\.ts$/,
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
  projects,
  webServer: {
    command: 'npm run dev',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
