// End-to-end tests against the running dev stack.
// Each test loads a fresh page (clean localStorage = fresh anon-{uuid}),
// so todos created by one test never appear in another.

import { test, expect, type Page } from '@playwright/test';

async function freshPage(page: Page) {
  await page.goto('/');
  // Wait for the app shell to render and the initial load to complete.
  await expect(page.getByRole('heading', { name: 'Todos' })).toBeVisible();
  // Empty-state confirms `LOAD_SUCCESS` fired (vs still loading or error).
  await expect(page.getByText('No todos yet.')).toBeVisible();
}

test('shows the empty state on first load', async ({ page }) => {
  await freshPage(page);
  await expect(page.getByText('No todos yet.')).toBeVisible();
  // The erase-link is hidden when there are no todos.
  await expect(page.getByRole('button', { name: 'Erase my data' })).toHaveCount(0);
});

test('typing + Enter creates a todo and renders it in the list', async ({ page }) => {
  await freshPage(page);
  const input = page.getByPlaceholder('Add a todo…');
  await input.fill('buy bread');
  await input.press('Enter');
  await expect(page.getByText('buy bread')).toBeVisible();
  // Empty state hides once a row exists.
  await expect(page.getByText('No todos yet.')).toHaveCount(0);
  // The erase-link appears.
  await expect(page.getByRole('button', { name: 'Erase my data' })).toBeVisible();
  // Input was cleared and re-focused.
  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();
});

test('clicking the checkbox toggles completion (with strike-through)', async ({ page }) => {
  await freshPage(page);
  await page.getByPlaceholder('Add a todo…').fill('mark me done');
  await page.getByPlaceholder('Add a todo…').press('Enter');
  await expect(page.getByText('mark me done')).toBeVisible();

  const checkbox = page.getByRole('checkbox', { name: /mark me done/i });
  await expect(checkbox).not.toBeChecked();
  await checkbox.click();
  await expect(checkbox).toBeChecked();
  // Description picks up the completed style class.
  await expect(page.locator('.todo-item__description--done')).toContainText('mark me done');
});

test('deleting a single todo removes it from the list', async ({ page }) => {
  await freshPage(page);
  await page.getByPlaceholder('Add a todo…').fill('to be deleted');
  await page.getByPlaceholder('Add a todo…').press('Enter');
  await expect(page.getByText('to be deleted')).toBeVisible();

  // The delete glyph is hover/focus-revealed; .click() triggers focus on it.
  await page.getByRole('button', { name: 'Delete' }).first().click();
  await expect(page.getByText('to be deleted')).toHaveCount(0);
  await expect(page.getByText('No todos yet.')).toBeVisible();
});

test('newest-first ordering: the most recent add is on top', async ({ page }) => {
  await freshPage(page);
  const input = page.getByPlaceholder('Add a todo…');
  await input.fill('first');
  await input.press('Enter');
  // Wait long enough for created_at to differ.
  await page.waitForTimeout(50);
  await input.fill('second');
  await input.press('Enter');
  await page.waitForTimeout(50);
  await input.fill('third');
  await input.press('Enter');

  const descriptions = await page.locator('.todo-item__description').allTextContents();
  expect(descriptions).toEqual(['third', 'second', 'first']);
});

test("Erase my data → Erase clears all of the caller's todos", async ({ page }) => {
  await freshPage(page);
  await page.getByPlaceholder('Add a todo…').fill('one');
  await page.getByPlaceholder('Add a todo…').press('Enter');
  await page.getByPlaceholder('Add a todo…').fill('two');
  await page.getByPlaceholder('Add a todo…').press('Enter');
  await expect(page.locator('.todo-item')).toHaveCount(2);

  await page.getByRole('button', { name: 'Erase my data' }).click();
  await expect(page.getByText('Erase all your todos? This cannot be undone.')).toBeVisible();
  await page.getByRole('button', { name: 'Erase', exact: true }).click();

  await expect(page.locator('.todo-item')).toHaveCount(0);
  await expect(page.getByText('No todos yet.')).toBeVisible();
});

test('Erase my data → Cancel collapses the confirm row without deleting', async ({ page }) => {
  await freshPage(page);
  await page.getByPlaceholder('Add a todo…').fill('keep me');
  await page.getByPlaceholder('Add a todo…').press('Enter');
  await expect(page.getByText('keep me')).toBeVisible();

  await page.getByRole('button', { name: 'Erase my data' }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText('keep me')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Erase my data' })).toBeVisible();
});
