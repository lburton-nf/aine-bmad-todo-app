// API client — single fetch wrapper that knows the server base URL,
// attaches X-User-Id from identity.ts, and surfaces failures as typed
// ApiError. Six exported functions match the server's REST surface.

import type { Todo, CreateTodoRequest, HealthResponse } from '../../shared/types';
import { getUserId } from './identity';

const BASE = (import.meta.env.VITE_API_BASE_URL ?? '') as string;
const DEFAULT_TIMEOUT_MS = 10_000;

export type ApiErrorCategory = 'server' | 'network' | 'timeout';

export class ApiError extends Error {
  readonly category: ApiErrorCategory;
  readonly status?: number;

  constructor(category: ApiErrorCategory, message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.category = category;
    this.status = status;
  }
}

interface RequestOpts {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  timeoutMs?: number;
}

async function request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const { method = 'GET', body, timeoutMs = DEFAULT_TIMEOUT_MS } = opts;

  const headers: Record<string, string> = {
    'X-User-Id': getUserId(),
  };
  let payload: BodyInit | undefined;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: payload,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new ApiError('timeout', `Request timed out after ${timeoutMs}ms`);
    }
    throw new ApiError('network', err instanceof Error ? err.message : 'fetch failed');
  }

  if (!response.ok) {
    let message = response.statusText || `HTTP ${response.status}`;
    try {
      const data = (await response.json()) as { message?: string };
      if (typeof data.message === 'string') message = data.message;
    } catch {
      // Body wasn't JSON; fall back to statusText.
    }
    throw new ApiError('server', message, response.status);
  }

  if (response.status === 204) return undefined as T;
  try {
    return (await response.json()) as T;
  } catch {
    // 2xx but body was not valid JSON (e.g. dev-server SPA fallback returning
    // HTML, or a misconfigured proxy). Surface as a server-category error
    // rather than letting a SyntaxError leak through.
    throw new ApiError(
      'server',
      `Expected JSON from ${path}, got an unparseable response`,
      response.status,
    );
  }
}

export function listTodos(): Promise<Todo[]> {
  return request<Todo[]>('/todos');
}

export function createTodo(input: CreateTodoRequest): Promise<Todo> {
  return request<Todo>('/todos', { method: 'POST', body: input });
}

export function toggleCompleted(id: string, completed: boolean): Promise<Todo> {
  return request<Todo>(`/todos/${id}`, { method: 'PATCH', body: { completed } });
}

export function deleteTodo(id: string): Promise<void> {
  return request<void>(`/todos/${id}`, { method: 'DELETE' });
}

export function deleteAll(): Promise<void> {
  return request<void>('/todos', { method: 'DELETE' });
}

export function health(): Promise<HealthResponse> {
  return request<HealthResponse>('/healthz');
}
