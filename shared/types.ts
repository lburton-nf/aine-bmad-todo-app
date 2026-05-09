// Canonical wire-shape contract shared by client and server.
// Type-only file — no runtime values, no JS emit.

export interface Todo {
  id: string;
  description: string;
  /** Unix epoch milliseconds. Server-minted at INSERT; never mutated. */
  created_at: number;
  completed: boolean;
}

export interface CreateTodoRequest {
  id: string;
  description: string;
}

export interface UpdateTodoRequest {
  completed: boolean;
}

export interface HealthResponse {
  ok: true;
  version: string;
}
