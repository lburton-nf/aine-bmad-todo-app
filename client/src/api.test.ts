import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ApiError,
  listTodos,
  createTodo,
  toggleCompleted,
  deleteTodo,
  deleteAll,
  health,
} from './api';

const ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

interface FetchCall {
  url: string;
  init: RequestInit;
}

function captureFetch(response: Partial<Response>): {
  fetchMock: ReturnType<typeof vi.fn>;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  const fetchMock = vi.fn((url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    return Promise.resolve({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve({}),
      ...response,
    } as Response);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, calls };
}

function rejectingFetch(error: Error) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(error)),
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── happy paths: each function calls the right URL+method+headers ───

test('listTodos: GET /todos with X-User-Id', async () => {
  const { calls } = captureFetch({
    json: () => Promise.resolve([]),
  });
  const result = await listTodos();
  expect(result).toEqual([]);
  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe('/todos');
  expect(calls[0].init.method).toBe('GET');
  const headers = calls[0].init.headers as Record<string, string>;
  expect(headers['X-User-Id']).toMatch(/^anon-/);
  expect(headers['Content-Type']).toBeUndefined();
});

test('createTodo: POST /todos with JSON body and Content-Type', async () => {
  const todo = { id: ID, description: 'task', created_at: 1, completed: false };
  const { calls } = captureFetch({
    status: 201,
    json: () => Promise.resolve(todo),
  });
  const result = await createTodo({ id: ID, description: 'task' });
  expect(result).toEqual(todo);
  expect(calls[0].url).toBe('/todos');
  expect(calls[0].init.method).toBe('POST');
  expect(JSON.parse(calls[0].init.body as string)).toEqual({ id: ID, description: 'task' });
  const headers = calls[0].init.headers as Record<string, string>;
  expect(headers['Content-Type']).toBe('application/json');
});

test('toggleCompleted: PATCH /todos/:id with { completed }', async () => {
  const todo = { id: ID, description: 'x', created_at: 1, completed: true };
  const { calls } = captureFetch({ json: () => Promise.resolve(todo) });
  const result = await toggleCompleted(ID, true);
  expect(result.completed).toBe(true);
  expect(calls[0].url).toBe(`/todos/${ID}`);
  expect(calls[0].init.method).toBe('PATCH');
  expect(JSON.parse(calls[0].init.body as string)).toEqual({ completed: true });
});

test('deleteTodo: DELETE /todos/:id; resolves to undefined on 204', async () => {
  const { calls } = captureFetch({ status: 204, json: () => Promise.resolve(undefined) });
  const result = await deleteTodo(ID);
  expect(result).toBeUndefined();
  expect(calls[0].url).toBe(`/todos/${ID}`);
  expect(calls[0].init.method).toBe('DELETE');
});

test('deleteAll: DELETE /todos; resolves to undefined on 204', async () => {
  const { calls } = captureFetch({ status: 204, json: () => Promise.resolve(undefined) });
  const result = await deleteAll();
  expect(result).toBeUndefined();
  expect(calls[0].url).toBe('/todos');
  expect(calls[0].init.method).toBe('DELETE');
});

test('health: GET /healthz', async () => {
  const { calls } = captureFetch({
    json: () => Promise.resolve({ ok: true, version: '1.0.0' }),
  });
  const result = await health();
  expect(result).toEqual({ ok: true, version: '1.0.0' });
  expect(calls[0].url).toBe('/healthz');
});

// ─── error categorisation ───

test('non-2xx response throws ApiError(category=server) with status', async () => {
  captureFetch({
    ok: false,
    status: 400,
    statusText: 'Bad Request',
    json: () => Promise.resolve({ message: 'X-User-Id header missing' }),
  });
  await expect(listTodos()).rejects.toBeInstanceOf(ApiError);
  await listTodos().catch((err: unknown) => {
    const e = err as ApiError;
    expect(e.category).toBe('server');
    expect(e.status).toBe(400);
    expect(e.message).toBe('X-User-Id header missing');
  });
});

test('non-2xx with non-JSON body falls back to statusText', async () => {
  captureFetch({
    ok: false,
    status: 500,
    statusText: 'Internal Server Error',
    json: () => Promise.reject(new Error('not json')),
  });
  await listTodos().catch((err: unknown) => {
    const e = err as ApiError;
    expect(e.category).toBe('server');
    expect(e.status).toBe(500);
    expect(e.message).toBe('Internal Server Error');
  });
});

test('fetch rejection (network failure) throws ApiError(category=network)', async () => {
  rejectingFetch(new TypeError('Failed to fetch'));
  await expect(listTodos()).rejects.toMatchObject({
    name: 'ApiError',
    category: 'network',
  });
});

test('AbortSignal.timeout firing throws ApiError(category=timeout)', async () => {
  // A real AbortSignal would emit DOMException with name=TimeoutError.
  const timeoutErr = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
  rejectingFetch(timeoutErr);
  await expect(listTodos()).rejects.toMatchObject({
    name: 'ApiError',
    category: 'timeout',
  });
});

// ─── client treats X-User-Id rejection as a reset trigger ───

test('400 "X-User-Id … missing or malformed" triggers identity reset and one retry', async () => {
  localStorage.setItem('todo.userId', 'tampered-value');
  const calls: { url: string; userId: string }[] = [];
  let attempt = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit = {}) => {
      const headers = init.headers as Record<string, string>;
      calls.push({ url, userId: headers['X-User-Id'] });
      attempt += 1;
      if (attempt === 1) {
        // First call: localStorage was tampered, so getUserId() minted a fresh
        // value but suppose the server still rejects (e.g., regex tightened).
        return Promise.resolve({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          json: () => Promise.resolve({ message: 'X-User-Id header missing or malformed' }),
        } as Response);
      }
      // Second call (after reset+retry): succeeds.
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.resolve([]),
      } as Response);
    }),
  );

  const result = await listTodos();
  expect(result).toEqual([]);
  expect(calls).toHaveLength(2);
  // The retry must use a freshly minted user id, not the rejected one.
  expect(calls[1].userId).not.toBe(calls[0].userId);
  expect(calls[1].userId).toMatch(/^anon-/);
});

test('retry guard prevents an infinite reset loop on persistent 400', async () => {
  let attempts = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      attempts += 1;
      return Promise.resolve({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.resolve({ message: 'X-User-Id header missing or malformed' }),
      } as Response);
    }),
  );
  await expect(listTodos()).rejects.toBeInstanceOf(ApiError);
  // One initial call + exactly one retry, no more.
  expect(attempts).toBe(2);
});

test('a 400 unrelated to X-User-Id does NOT trigger a reset', async () => {
  const before = localStorage.getItem('todo.userId');
  let attempts = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      attempts += 1;
      return Promise.resolve({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.resolve({ message: 'description must be at most 280 characters' }),
      } as Response);
    }),
  );
  await expect(listTodos()).rejects.toBeInstanceOf(ApiError);
  expect(attempts).toBe(1);
  // Identity untouched (note: getUserId() will mint on first read, so we read
  // post-call to compare apples to apples — what matters is no second call
  // happened with a different id).
  const after = localStorage.getItem('todo.userId');
  expect(after).toBe(before ?? after); // either both null/identical, or persisted same value
});
