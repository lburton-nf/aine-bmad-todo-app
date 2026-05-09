// Optimistic-UI rollback. For each mutation (create / toggle / delete), the
// failing response is delayed 500 ms so Playwright can observe the
// optimistic frame before the rollback fires — without the delay the
// optimistic state would land and revert in a single tick.

import { test, expect, type Route } from '@playwright/test';
import { addTodo, freshPage } from './helpers';

const FAILURE_DELAY_MS = 500;

async function fail(route: Route) {
  await new Promise((r) => setTimeout(r, FAILURE_DELAY_MS));
  await route.fulfill({
    status: 500,
    contentType: 'application/json',
    body: JSON.stringify({ statusCode: 500, error: 'Internal Server Error', message: 'boom' }),
  });
}

test('POST rollback — optimistic create reverts on server failure', async ({ page }) => {
  // Register the failing POST route BEFORE goto so the handler is in place
  // when the user types. The initial GET is allowed through via continue().
  await page.route('**/todos', async (route) => {
    if (route.request().method() === 'POST') return fail(route);
    return route.continue();
  });

  await freshPage(page);
  await addTodo(page, 'rollback me');

  // Optimistic: row is in the list before the server has responded.
  await expect(page.getByText('rollback me')).toBeVisible();

  // Rollback: alert appears and the row disappears.
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByText('rollback me')).toHaveCount(0);
});

test('PATCH rollback — optimistic toggle reverts on server failure', async ({ page }) => {
  await freshPage(page);

  // Create a real todo first (no mock yet).
  await addTodo(page, 'toggle me');
  await expect(page.getByText('toggle me')).toBeVisible();

  // Now mock PATCH /todos/:id to fail. Bulk routes (`/todos`) are unaffected
  // because this regex requires a path segment after `/todos/`.
  await page.route(/\/todos\/[^/]+$/, async (route) => {
    if (route.request().method() === 'PATCH') return fail(route);
    return route.continue();
  });

  const checkbox = page.getByRole('checkbox', { name: /toggle me/i });
  await expect(checkbox).not.toBeChecked();
  await checkbox.click();

  // Optimistic: checked while the request is in flight.
  await expect(checkbox).toBeChecked();

  // Rollback: alert appears, checkbox flips back.
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(checkbox).not.toBeChecked();
});

test('DELETE rollback — optimistic delete restores the row on server failure', async ({ page }) => {
  await freshPage(page);

  // Create a real todo first.
  await addTodo(page, 'delete me');
  await expect(page.getByText('delete me')).toBeVisible();

  // Mock DELETE /todos/:id to fail (bulk delete on /todos remains unaffected).
  await page.route(/\/todos\/[^/]+$/, async (route) => {
    if (route.request().method() === 'DELETE') return fail(route);
    return route.continue();
  });

  await page.locator('.todo-item').first().getByRole('button', { name: 'Delete' }).click();

  // Optimistic: row removed before the server has responded.
  await expect(page.getByText('delete me')).toHaveCount(0);

  // Rollback: alert appears, row reappears.
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByText('delete me')).toBeVisible();
});
