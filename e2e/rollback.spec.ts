// NFR-2 — automated proof of the optimistic-UI rollback contract.
// For each mutation (create / toggle / delete), force the server to fail and
// assert: (a) the optimistic state appears, (b) the rollback restores the
// pre-mutation state, (c) the error alert is rendered.
//
// We delay the failing response by 500 ms so the optimistic state is observable
// to Playwright's polling assertions. Without the delay the optimistic frame
// can land and roll back inside a single tick.

import { test, expect, type Route, type Page } from '@playwright/test';

const FAILURE_DELAY_MS = 500;

async function freshPage(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Todos' })).toBeVisible();
  await expect(page.getByText('No todos yet.')).toBeVisible();
}

async function fail(route: Route) {
  await new Promise((r) => setTimeout(r, FAILURE_DELAY_MS));
  await route.fulfill({
    status: 500,
    contentType: 'application/json',
    body: JSON.stringify({ statusCode: 500, error: 'Internal Server Error', message: 'boom' }),
  });
}

test('NFR-2: POST rollback — optimistic create reverts on server failure', async ({ page }) => {
  // Register the failing POST route BEFORE goto so the handler is in place
  // when the user types. The initial GET is allowed through via continue().
  await page.route('**/todos', async (route) => {
    if (route.request().method() === 'POST') return fail(route);
    return route.continue();
  });

  await freshPage(page);
  const input = page.getByPlaceholder('Add a todo…');
  await input.fill('rollback me');
  await input.press('Enter');

  // Optimistic: row is in the list before the server has responded.
  await expect(page.getByText('rollback me')).toBeVisible();

  // Rollback: alert appears and the row disappears.
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByText('rollback me')).toHaveCount(0);
});

test('NFR-2: PATCH rollback — optimistic toggle reverts on server failure', async ({ page }) => {
  await freshPage(page);

  // Create a real todo first (no mock yet).
  await page.getByPlaceholder('Add a todo…').fill('toggle me');
  await page.getByPlaceholder('Add a todo…').press('Enter');
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

test('NFR-2: DELETE rollback — optimistic delete restores the row on server failure', async ({
  page,
}) => {
  await freshPage(page);

  // Create a real todo first.
  await page.getByPlaceholder('Add a todo…').fill('delete me');
  await page.getByPlaceholder('Add a todo…').press('Enter');
  await expect(page.getByText('delete me')).toBeVisible();

  // Mock DELETE /todos/:id to fail (bulk delete on /todos remains unaffected).
  await page.route(/\/todos\/[^/]+$/, async (route) => {
    if (route.request().method() === 'DELETE') return fail(route);
    return route.continue();
  });

  // Delete glyph is visibility:hidden until row hover.
  const row = page.locator('.todo-item').first();
  await row.hover();
  await row.getByRole('button', { name: 'Delete' }).click();

  // Optimistic: row removed before the server has responded.
  await expect(page.getByText('delete me')).toHaveCount(0);

  // Rollback: alert appears, row reappears.
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByText('delete me')).toBeVisible();
});
