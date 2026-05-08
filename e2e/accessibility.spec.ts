// Accessibility audit via axe-core. Runs against three application states
// (empty, populated, error) and asserts zero critical/serious violations.
//
// The bar is "zero critical WCAG violations" per Phase 1-2 success criteria.
// We treat both `critical` and `serious` axe impacts as failures since they
// map to WCAG-A and -AA findings respectively.

import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const BLOCKING_IMPACTS = ['critical', 'serious'] as const;

async function expectNoBlockingViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const blocking = results.violations.filter((v) =>
    (BLOCKING_IMPACTS as readonly string[]).includes(v.impact ?? ''),
  );
  if (blocking.length > 0) {
    const summary = blocking
      .map((v) => `[${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} nodes)`)
      .join('\n');
    throw new Error(`Blocking a11y violations in ${label}:\n${summary}`);
  }
  expect(blocking).toHaveLength(0);
}

test('a11y: empty state', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('No todos yet.')).toBeVisible();
  await expectNoBlockingViolations(page, 'empty state');
});

test('a11y: populated state with at least one todo', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('No todos yet.')).toBeVisible();
  await page.getByPlaceholder('Add a todo…').fill('a11y check item');
  await page.getByPlaceholder('Add a todo…').press('Enter');
  await expect(page.getByText('a11y check item')).toBeVisible();
  await expectNoBlockingViolations(page, 'populated state');
});

test('a11y: error state (server unreachable on initial load)', async ({ page }) => {
  // Block /todos so the initial fetch fails and the ErrorState renders.
  await page.route('**/todos', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByRole('alert')).toBeVisible();
  await expectNoBlockingViolations(page, 'error state');
});
