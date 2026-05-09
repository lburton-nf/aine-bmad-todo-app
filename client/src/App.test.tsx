import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import App from './App';

let root: Root | null = null;
let container: HTMLElement | null = null;

beforeEach(() => {
  localStorage.clear();
  // Default fetch: returns empty list immediately.
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.resolve([]),
      } as Response),
    ),
  );
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  if (container) container.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
});

async function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container!);
    root.render(<App />);
  });
  // Allow the load() promise to resolve and re-render.
  await act(async () => {
    await Promise.resolve();
  });
  return container;
}

test('App renders the page title "Todos"', async () => {
  const c = await mount();
  expect(c.querySelector('h1')?.textContent).toBe('Todos');
});

test('App mounts the TodoInput in the input slot', async () => {
  const c = await mount();
  const input = c.querySelector<HTMLInputElement>('[data-slot="input"] .todo-input');
  expect(input).not.toBeNull();
  expect(input?.placeholder).toBe('Add a todo…');
});

test('App shows EmptyState when load returns []', async () => {
  const c = await mount();
  expect(c.textContent).toContain('No todos yet.');
});

test('App shows ErrorState when load fails', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
  );
  const c = await mount();
  expect(c.querySelector('[role="alert"]')).not.toBeNull();
});

test('App shows DeleteAllControl when there is at least one todo', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () =>
          Promise.resolve([
            {
              id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
              description: 'first',
              created_at: 1,
              completed: false,
            },
          ]),
      } as Response),
    ),
  );
  const c = await mount();
  expect(c.querySelector('.delete-all-link')).not.toBeNull();
});

// ─── App-level mutation flows (integration through reducer + api) ─────

interface FetchCall {
  url: string;
  init: RequestInit;
}

function captureFetch(initial: unknown[]): {
  fetchMock: ReturnType<typeof vi.fn>;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  let firstCall = true;
  const fetchMock = vi.fn((url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    // First call is the initial GET /todos. Echo `initial`.
    if (firstCall) {
      firstCall = false;
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.resolve(initial),
      } as Response);
    }
    // Subsequent calls — echo the body for POST/PATCH; 204 for DELETE.
    if (init.method === 'DELETE') {
      return Promise.resolve({
        ok: true,
        status: 204,
        statusText: 'No Content',
        json: () => Promise.resolve(undefined),
      } as Response);
    }
    let echo: unknown = {};
    if (typeof init.body === 'string') {
      try {
        echo = JSON.parse(init.body);
      } catch {
        /* */
      }
    }
    return Promise.resolve({
      ok: true,
      status: init.method === 'POST' ? 201 : 200,
      statusText: 'OK',
      json: () =>
        Promise.resolve({
          id: (echo as { id?: string }).id ?? 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa9',
          description: (echo as { description?: string }).description ?? 'echo',
          completed: (echo as { completed?: boolean }).completed ?? false,
          created_at: 12345,
        }),
    } as Response);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, calls };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
}

test('typing in the input + Enter posts a new todo', async () => {
  const { calls } = captureFetch([]);
  const c = await mount();
  const input = c.querySelector<HTMLInputElement>('.todo-input')!;
  const setNativeValue = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )?.set?.bind(input);
  act(() => {
    setNativeValue?.('milk');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  await flush();
  const post = calls.find((call) => call.init.method === 'POST');
  expect(post).toBeDefined();
  expect(post!.url).toBe('/todos');
  const parsedBody = JSON.parse(post!.init.body as string) as { description: string };
  expect(parsedBody.description).toBe('milk');
});

test('clicking the checkbox PATCHes /todos/:id', async () => {
  const seed = [
    {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
      description: 'first',
      completed: false,
      created_at: 1,
    },
  ];
  const { calls } = captureFetch(seed);
  const c = await mount();
  const checkbox = c.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  act(() => {
    checkbox.click();
  });
  await flush();
  const patch = calls.find((call) => call.init.method === 'PATCH');
  expect(patch).toBeDefined();
  expect(patch!.url).toContain(seed[0].id);
});

test('clicking the delete glyph DELETEs /todos/:id', async () => {
  const seed = [
    {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
      description: 'first',
      completed: false,
      created_at: 1,
    },
  ];
  const { calls } = captureFetch(seed);
  const c = await mount();
  const del = c.querySelector<HTMLButtonElement>('.delete-glyph')!;
  act(() => {
    del.click();
  });
  await flush();
  const deleteCall = calls.find((call) => call.init.method === 'DELETE');
  expect(deleteCall).toBeDefined();
  expect(deleteCall!.url).toBe(`/todos/${seed[0].id}`);
});

test('DeleteAllControl Erase DELETEs /todos (bulk)', async () => {
  const seed = [
    {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
      description: 'first',
      completed: false,
      created_at: 1,
    },
  ];
  const { calls } = captureFetch(seed);
  const c = await mount();
  act(() => {
    c.querySelector<HTMLButtonElement>('.delete-all-link')!.click();
  });
  act(() => {
    c.querySelector<HTMLButtonElement>('.delete-all-confirm__erase')!.click();
  });
  await flush();
  const bulk = calls.find((call) => call.init.method === 'DELETE' && call.url === '/todos');
  expect(bulk).toBeDefined();
});

test('Retry after a failed load reloads', async () => {
  // First call rejects, second succeeds.
  let attempt = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      attempt += 1;
      if (attempt === 1) return Promise.reject(new TypeError('Failed to fetch'));
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.resolve([]),
      } as Response);
    }),
  );
  const c = await mount();
  // Error rendered.
  expect(c.querySelector('[role="alert"]')).not.toBeNull();
  act(() => {
    c.querySelector<HTMLButtonElement>('.state-message__retry')!.click();
  });
  await flush();
  // Empty state now visible.
  expect(c.textContent).toContain('No todos yet.');
});
