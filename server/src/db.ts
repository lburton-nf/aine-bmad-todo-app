// Persistence module — the ONLY place SQL touches the todos table.
// Every read/write/delete scopes by user_id (NFR-1).

import Database from 'better-sqlite3';
import type { Todo, CreateTodoRequest } from '../../shared/types';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS todos (
  id          TEXT    PRIMARY KEY,
  user_id     TEXT    NOT NULL,
  description TEXT    NOT NULL,
  created_at  INTEGER NOT NULL,
  completed   INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
);
CREATE INDEX IF NOT EXISTS todos_user_id_created_at
  ON todos (user_id, created_at DESC);
`;

// SQLite stores `completed` as 0|1; the Todo wire shape is boolean.
// This row type is internal — it never crosses the module boundary.
interface TodoRow {
  id: string;
  description: string;
  created_at: number;
  completed: number;
}

function rowToTodo(row: TodoRow): Todo {
  return {
    id: row.id,
    description: row.description,
    created_at: row.created_at,
    completed: row.completed === 1,
  };
}

export interface Db {
  listTodosForUser(userId: string): Todo[];
  createTodo(userId: string, input: CreateTodoRequest): Todo;
  /** Returns the updated Todo, or null if the row is missing OR not owned by userId (AI-3 unification). */
  updateCompleted(userId: string, id: string, completed: boolean): Todo | null;
  /** Returns true if a row was removed; false if missing OR not owned (AI-3 unification). */
  deleteTodo(userId: string, id: string): boolean;
  /** Returns the count removed. */
  deleteAllForUser(userId: string): number;
  close(): void;
}

export function initialize(dbPath: string): Db {
  if (!dbPath) {
    throw new Error('initialize(dbPath): dbPath must be a non-empty string.');
  }
  const conn = new Database(dbPath);
  // Production SQLite hygiene — WAL improves concurrent-read perf;
  // busy_timeout absorbs brief contention rather than failing immediately.
  conn.pragma('journal_mode = WAL');
  conn.pragma('busy_timeout = 5000');
  conn.exec(SCHEMA);

  const stmtList = conn.prepare<[string], TodoRow>(
    // `id DESC` tiebreaker keeps ordering deterministic when two inserts land in the same millisecond.
    'SELECT id, description, created_at, completed FROM todos WHERE user_id = ? ORDER BY created_at DESC, id DESC',
  );
  const stmtCreate = conn.prepare<[string, string, string, number, number], TodoRow>(
    'INSERT INTO todos (id, user_id, description, created_at, completed) VALUES (?, ?, ?, ?, ?) RETURNING id, description, created_at, completed',
  );
  const stmtUpdate = conn.prepare<[number, string, string], TodoRow>(
    'UPDATE todos SET completed = ? WHERE id = ? AND user_id = ? RETURNING id, description, created_at, completed',
  );
  const stmtDelete = conn.prepare<[string, string]>(
    'DELETE FROM todos WHERE id = ? AND user_id = ?',
  );
  const stmtDeleteAll = conn.prepare<[string]>('DELETE FROM todos WHERE user_id = ?');

  let closed = false;

  return {
    listTodosForUser(userId) {
      return stmtList.all(userId).map(rowToTodo);
    },
    createTodo(userId, input) {
      const created_at = Date.now();
      const row = stmtCreate.get(input.id, userId, input.description, created_at, 0);
      if (!row) {
        // INSERT with RETURNING and no constraint failure should always emit
        // a row; if better-sqlite3's contract changes, fail loud here.
        throw new Error('createTodo: INSERT did not return a row');
      }
      return rowToTodo(row);
    },
    updateCompleted(userId, id, completed) {
      const row = stmtUpdate.get(completed ? 1 : 0, id, userId);
      return row ? rowToTodo(row) : null;
    },
    deleteTodo(userId, id) {
      const info = stmtDelete.run(id, userId);
      return info.changes > 0;
    },
    deleteAllForUser(userId) {
      const info = stmtDeleteAll.run(userId);
      return info.changes;
    },
    close() {
      if (closed) return;
      closed = true;
      conn.close();
    },
  };
}
