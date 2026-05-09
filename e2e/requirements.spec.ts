// Spec coverage for FR22-24 (keyboard accessibility) and NFR-3 (polish
// ceiling — 320 px responsive layout). Every other FR/NFR is verified
// elsewhere in the test pyramid; see TEST_REPORT.md's traceability matrix.

import { test, expect } from '@playwright/test';
import { addTodo, freshPage } from './helpers';

test('FR22-24: keyboard navigation reaches every interactive element; focused elements show an outline', async ({
  page,
}) => {
  await freshPage(page);
  await addTodo(page, 'keyboard probe');

  // TodoInput auto-focuses on mount.
  const input = page.getByPlaceholder('Add a todo…');
  await expect(input).toBeFocused();

  // Visible focus indicator (FR24). The input has an explicit `outline:
  // 2px solid var(--color-accent)` on `:focus`. Browsers also draw a
  // default ring, but we want the project's own indicator.
  const inputOutlineWidth = await input.evaluate((el) => getComputedStyle(el).outlineWidth);
  expect(inputOutlineWidth).not.toBe('0px');

  // Tab → row checkbox.
  await page.keyboard.press('Tab');
  const checkbox = page.getByRole('checkbox', { name: /keyboard probe/i });
  await expect(checkbox).toBeFocused();

  // Tab → delete button for the row.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: /Delete "keyboard probe"/i })).toBeFocused();

  // Tab → "Erase my data" link.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Erase my data' })).toBeFocused();

  // Space activates the focused button (FR23). Should expand to the
  // confirm row, where focus moves to Cancel (safe-default).
  await page.keyboard.press(' ');
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused();

  // Escape collapses the confirm row without deleting (Mi6 + DeleteAllControl).
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Erase my data' })).toBeVisible();
  await expect(page.getByText('keyboard probe')).toBeVisible();
});

test('NFR-3: layout works at 320 px viewport (no horizontal scroll, key elements in viewport)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 600 });
  await freshPage(page);
  await addTodo(page, 'narrow viewport check');

  // No horizontal scroll at 320 px.
  const horizontallyOverflows = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth > root.clientWidth;
  });
  expect(horizontallyOverflows).toBe(false);

  // Header, input, row description, and erase-link all reachable on screen.
  await expect(page.getByRole('heading', { name: 'Todos' })).toBeInViewport();
  await expect(page.getByPlaceholder('Add a todo…')).toBeInViewport();
  await expect(page.getByText('narrow viewport check')).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Erase my data' })).toBeInViewport();
});
