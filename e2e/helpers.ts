import { expect, type Page } from '@playwright/test';

export async function freshPage(page: Page) {
  await page.goto('/');
  // Wait for the app shell to render and the initial load to settle.
  await expect(page.getByRole('heading', { name: 'Todos' })).toBeVisible();
  await expect(page.getByText('No todos yet.')).toBeVisible();
}

export async function addTodo(page: Page, description: string) {
  const input = page.getByPlaceholder('Add a todo…');
  await input.fill(description);
  await input.press('Enter');
}
