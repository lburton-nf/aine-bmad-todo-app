import { defineConfig, devices } from '@playwright/test';

// Production smoke config — drives a real Chromium against the *Docker
// container* (the artifact that actually deploys), not the Vite dev stack.
//
// Lifecycle (build, start, healthz wait, teardown) is owned by
// `scripts/test-e2e-docker.sh`; this config only runs tests against the
// already-running container at DOCKER_BASE_URL.

const baseURL = process.env.DOCKER_BASE_URL ?? 'http://localhost:3098';

export default defineConfig({
  testDir: './e2e',
  testMatch: /smoke\.docker\.spec\.ts$/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  outputDir: 'test-results-docker',
  use: {
    baseURL,
    trace: 'on-first-retry',
    storageState: undefined,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
