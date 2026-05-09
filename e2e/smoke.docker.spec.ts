// Production smoke suite — runs against the built Docker container, not the
// dev stack. Closes the gap that the dev e2e leaves: static-serve via
// @fastify/static, same-origin CORS, the production React bundle, and the
// AI-2 404-envelope invariant when the static plugin is registered.
//
// Lifecycle is owned by `scripts/test-e2e-docker.sh`; this file assumes the
// container is healthy at the configured baseURL.

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('healthz returns the canonical shape with the package version', async ({
  request,
  baseURL,
}) => {
  const res = await request.get(`${baseURL}/healthz`);
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { ok: boolean; version: string };
  expect(body.ok).toBe(true);
  // The npm-start fix guarantees npm_package_version is populated; '0.0.0'
  // would mean the container is being run via raw `node`, not `npm start`.
  expect(body.version).not.toBe('0.0.0');
  expect(body.version).toMatch(/^\d+\.\d+\.\d+$/);
});

test('AI-2: unknown path returns the default JSON 404 envelope (production layering)', async ({
  request,
  baseURL,
}) => {
  // In dev this is verified by server.test.ts; in production @fastify/static
  // is registered AFTER the routes, and we want to confirm the layering still
  // ends in Fastify's default 404 (no SPA fallback, no static-plugin masking).
  const res = await request.get(`${baseURL}/no-such-route-exists`);
  expect(res.status()).toBe(404);
  expect(res.headers()['content-type']).toMatch(/application\/json/);
  const body = (await res.json()) as { statusCode: number; error: string; message: string };
  expect(body.statusCode).toBe(404);
  expect(body.error).toBe('Not Found');
});

test('app shell loads and shows the empty state from the production bundle', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Todos' })).toBeVisible();
  await expect(page.getByText('No todos yet.')).toBeVisible();
});

test('create round-trip: POST /todos works through Fastify (no proxy in production)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByText('No todos yet.')).toBeVisible();
  await page.getByPlaceholder('Add a todo…').fill('production smoke');
  await page.getByPlaceholder('Add a todo…').press('Enter');
  await expect(page.getByText('production smoke')).toBeVisible();
  await expect(page.getByText('No todos yet.')).toHaveCount(0);
});

test('FR11: data persists across page reload (same anon-{uuid}, same volume)', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('No todos yet.')).toBeVisible();
  await page.getByPlaceholder('Add a todo…').fill('survives reload');
  await page.getByPlaceholder('Add a todo…').press('Enter');
  await expect(page.getByText('survives reload')).toBeVisible();

  await page.reload();
  // After reload, the same anon-{uuid} (localStorage) drives the GET, and
  // the row must still be there. This is the demo step 4 / 8 invariant.
  await expect(page.getByText('survives reload')).toBeVisible();
  await expect(page.getByText('No todos yet.')).toHaveCount(0);
});

test('a11y: production bundle is axe-clean on the populated state', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('No todos yet.')).toBeVisible();
  await page.getByPlaceholder('Add a todo…').fill('a11y smoke');
  await page.getByPlaceholder('Add a todo…').press('Enter');
  await expect(page.getByText('a11y smoke')).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  );
  if (blocking.length > 0) {
    const summary = blocking
      .map((v) => `[${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} nodes)`)
      .join('\n');
    throw new Error(`Blocking a11y violations on production bundle:\n${summary}`);
  }
  expect(blocking).toHaveLength(0);
});
