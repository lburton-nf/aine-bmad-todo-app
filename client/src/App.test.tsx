import { test, expect, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import App from './App';

let root: Root | null = null;
let container: HTMLElement | null = null;

function mount(): HTMLElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container!);
    root.render(<App />);
  });
  return container;
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  if (container) container.remove();
  root = null;
  container = null;
});

test('renders the page title "Todos"', () => {
  const c = mount();
  expect(c.textContent).toContain('Todos');
  expect(c.querySelector('h1')?.textContent).toBe('Todos');
});

test('exposes the four placeholder slots Epic 4 will fill', () => {
  const c = mount();
  expect(c.querySelector('[data-slot="input"]')).not.toBeNull();
  expect(c.querySelector('[data-slot="state"]')).not.toBeNull();
  expect(c.querySelector('[data-slot="list"]')).not.toBeNull();
  expect(c.querySelector('[data-slot="erase"]')).not.toBeNull();
});

test('top-level container is the .app-shell main element', () => {
  const c = mount();
  const main = c.querySelector('main.app-shell');
  expect(main).not.toBeNull();
  expect(main?.tagName).toBe('MAIN');
});
