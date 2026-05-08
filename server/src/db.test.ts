import { test, expect } from 'vitest';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { unlinkSync, existsSync } from 'node:fs';
import { initialize, type Db } from './db';

const U1 = 'anon-11111111-1111-1111-1111-111111111111';
const U2 = 'anon-22222222-2222-2222-2222-222222222222';

function fixtureId(suffix: string): string {
  return `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa${suffix.padStart(4, '0')}`;
}

function makeDb(): Db {
  return initialize(':memory:');
}

test('initialize creates the todos table (writes succeed without "no such table")', () => {
  const db = makeDb();
  try {
    expect(() => db.createTodo(U1, { id: fixtureId('1'), description: 'milk' })).not.toThrow();
  } finally {
    db.close();
  }
});

test('initialize creates the composite index (newest-first ordering works)', () => {
  const db = makeDb();
  try {
    db.createTodo(U1, { id: fixtureId('1'), description: 'first' });
    // Force a measurable gap so created_at sorts deterministically.
    const before = Date.now();
    while (Date.now() === before) {
      /* spin until the millisecond ticks */
    }
    db.createTodo(U1, { id: fixtureId('2'), description: 'second' });
    const rows = db.listTodosForUser(U1);
    expect(rows.map((r) => r.description)).toEqual(['second', 'first']);
  } finally {
    db.close();
  }
});

test('initialize is idempotent: re-running against a populated DB preserves rows', () => {
  const dbPath = path.join(tmpdir(), `todos-test-${Date.now()}-${Math.random()}.db`);
  try {
    const db1 = initialize(dbPath);
    db1.createTodo(U1, { id: fixtureId('1'), description: 'persisted' });
    db1.close();

    const db2 = initialize(dbPath);
    try {
      const rows = db2.listTodosForUser(U1);
      expect(rows).toHaveLength(1);
      expect(rows[0].description).toBe('persisted');
    } finally {
      db2.close();
    }
  } finally {
    if (existsSync(dbPath)) unlinkSync(dbPath);
  }
});

test('createTodo returns the persisted Todo with completed=false and created_at ≈ now', () => {
  const db = makeDb();
  try {
    const before = Date.now();
    const todo = db.createTodo(U1, { id: fixtureId('1'), description: 'buy bread' });
    const after = Date.now();
    expect(todo.id).toBe(fixtureId('1'));
    expect(todo.description).toBe('buy bread');
    expect(todo.completed).toBe(false);
    expect(todo.created_at).toBeGreaterThanOrEqual(before);
    expect(todo.created_at).toBeLessThanOrEqual(after);
  } finally {
    db.close();
  }
});

test('listTodosForUser returns only this user (cross-user isolation)', () => {
  const db = makeDb();
  try {
    db.createTodo(U1, { id: fixtureId('1'), description: 'u1-a' });
    db.createTodo(U2, { id: fixtureId('2'), description: 'u2-a' });
    db.createTodo(U1, { id: fixtureId('3'), description: 'u1-b' });
    const u1Rows = db.listTodosForUser(U1);
    const u2Rows = db.listTodosForUser(U2);
    expect(u1Rows.map((r) => r.description).sort()).toEqual(['u1-a', 'u1-b']);
    expect(u2Rows.map((r) => r.description)).toEqual(['u2-a']);
  } finally {
    db.close();
  }
});

test('updateCompleted flips the bit and returns the updated Todo', () => {
  const db = makeDb();
  try {
    db.createTodo(U1, { id: fixtureId('1'), description: 'task' });
    const updated = db.updateCompleted(U1, fixtureId('1'), true);
    expect(updated).not.toBeNull();
    expect(updated!.completed).toBe(true);
    const rows = db.listTodosForUser(U1);
    expect(rows[0].completed).toBe(true);
  } finally {
    db.close();
  }
});

test('AI-3: updateCompleted on a row owned by another user returns null and does not mutate', () => {
  const db = makeDb();
  try {
    db.createTodo(U2, { id: fixtureId('1'), description: 'u2 task' });
    const result = db.updateCompleted(U1, fixtureId('1'), true);
    expect(result).toBeNull();
    const u2Row = db.listTodosForUser(U2)[0];
    expect(u2Row.completed).toBe(false);
  } finally {
    db.close();
  }
});

test('AI-3: updateCompleted on a missing id returns null (same as cross-user — no leak)', () => {
  const db = makeDb();
  try {
    const result = db.updateCompleted(U1, fixtureId('9'), true);
    expect(result).toBeNull();
  } finally {
    db.close();
  }
});

test('deleteTodo removes the row and returns true', () => {
  const db = makeDb();
  try {
    db.createTodo(U1, { id: fixtureId('1'), description: 'task' });
    expect(db.deleteTodo(U1, fixtureId('1'))).toBe(true);
    expect(db.listTodosForUser(U1)).toHaveLength(0);
  } finally {
    db.close();
  }
});

test('AI-3: deleteTodo on cross-user row returns false and leaves the row', () => {
  const db = makeDb();
  try {
    db.createTodo(U2, { id: fixtureId('1'), description: 'u2 task' });
    expect(db.deleteTodo(U1, fixtureId('1'))).toBe(false);
    expect(db.listTodosForUser(U2)).toHaveLength(1);
  } finally {
    db.close();
  }
});

test('deleteAllForUser removes only this user, returns count, leaves other users untouched', () => {
  const db = makeDb();
  try {
    db.createTodo(U1, { id: fixtureId('1'), description: 'a' });
    db.createTodo(U1, { id: fixtureId('2'), description: 'b' });
    db.createTodo(U2, { id: fixtureId('3'), description: 'c' });
    db.createTodo(U2, { id: fixtureId('4'), description: 'd' });
    db.createTodo(U2, { id: fixtureId('5'), description: 'e' });
    const count = db.deleteAllForUser(U1);
    expect(count).toBe(2);
    expect(db.listTodosForUser(U1)).toHaveLength(0);
    expect(db.listTodosForUser(U2)).toHaveLength(3);
  } finally {
    db.close();
  }
});

test('close releases the connection (subsequent use throws)', () => {
  const db = makeDb();
  db.close();
  expect(() => db.listTodosForUser(U1)).toThrow();
});

test('close is idempotent (second call is a no-op, not a throw)', () => {
  const db = makeDb();
  db.close();
  expect(() => db.close()).not.toThrow();
});

test('initialize rejects empty dbPath', () => {
  expect(() => initialize('')).toThrow(/non-empty string/);
});
