import { test, expect } from 'vitest';
import { todoReducer, initialState, type TodoState } from './reducer';
import type { Todo } from '../../shared/types';

const T1: Todo = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
  description: 'one',
  created_at: 100,
  completed: false,
};
const T2: Todo = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
  description: 'two',
  created_at: 200,
  completed: false,
};
const T3: Todo = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
  description: 'three',
  created_at: 300,
  completed: true,
};

function stateWith(todos: Todo[]): TodoState {
  return { ...initialState, todos };
}

test('LOAD_REQUEST sets loading and clears error', () => {
  const next = todoReducer({ ...initialState, error: 'old' }, { type: 'LOAD_REQUEST' });
  expect(next.loading).toBe(true);
  expect(next.error).toBeNull();
});

test('LOAD_SUCCESS replaces todos and clears loading', () => {
  const next = todoReducer(
    { ...initialState, loading: true },
    { type: 'LOAD_SUCCESS', todos: [T1, T2] },
  );
  expect(next.loading).toBe(false);
  expect(next.todos).toEqual([T1, T2]);
});

test('LOAD_FAILURE sets error and clears loading', () => {
  const next = todoReducer(
    { ...initialState, loading: true },
    { type: 'LOAD_FAILURE', error: 'boom' },
  );
  expect(next.loading).toBe(false);
  expect(next.error).toBe('boom');
});

test('OPTIMISTIC_CREATE prepends + adds id to pending', () => {
  const next = todoReducer(stateWith([T2]), { type: 'OPTIMISTIC_CREATE', todo: T1 });
  expect(next.todos).toEqual([T1, T2]);
  expect(next.optimisticPending.has(T1.id)).toBe(true);
});

test('CONFIRM_CREATE replaces optimistic todo + removes from pending', () => {
  const start: TodoState = {
    ...initialState,
    todos: [T1, T2],
    optimisticPending: new Set([T1.id]),
  };
  const serverEcho: Todo = { ...T1, created_at: 999 };
  const next = todoReducer(start, { type: 'CONFIRM_CREATE', id: T1.id, todo: serverEcho });
  expect(next.todos[0].created_at).toBe(999);
  expect(next.optimisticPending.has(T1.id)).toBe(false);
});

test('ROLLBACK_CREATE removes the row + sets error + drops from pending', () => {
  const start: TodoState = {
    ...initialState,
    todos: [T1, T2],
    optimisticPending: new Set([T1.id]),
  };
  const next = todoReducer(start, {
    type: 'ROLLBACK_CREATE',
    id: T1.id,
    reason: 'server rejected',
  });
  expect(next.todos).toEqual([T2]);
  expect(next.optimisticPending.has(T1.id)).toBe(false);
  expect(next.error).toBe('server rejected');
});

test('OPTIMISTIC_TOGGLE flips completed + adds to pending', () => {
  const next = todoReducer(stateWith([T1]), { type: 'OPTIMISTIC_TOGGLE', id: T1.id });
  expect(next.todos[0].completed).toBe(true);
  expect(next.optimisticPending.has(T1.id)).toBe(true);
});

test('CONFIRM_TOGGLE applies server echo + removes from pending', () => {
  const start: TodoState = {
    ...initialState,
    todos: [{ ...T1, completed: true }],
    optimisticPending: new Set([T1.id]),
  };
  const serverEcho: Todo = { ...T1, completed: true, description: 'updated by server' };
  const next = todoReducer(start, { type: 'CONFIRM_TOGGLE', id: T1.id, todo: serverEcho });
  expect(next.todos[0].description).toBe('updated by server');
  expect(next.optimisticPending.has(T1.id)).toBe(false);
});

test('ROLLBACK_TOGGLE flips back + sets error + removes from pending', () => {
  const start: TodoState = {
    ...initialState,
    todos: [{ ...T1, completed: true }],
    optimisticPending: new Set([T1.id]),
  };
  const next = todoReducer(start, { type: 'ROLLBACK_TOGGLE', id: T1.id, reason: 'network' });
  expect(next.todos[0].completed).toBe(false);
  expect(next.optimisticPending.has(T1.id)).toBe(false);
  expect(next.error).toBe('network');
});

test('OPTIMISTIC_DELETE removes the row + adds to pending', () => {
  const next = todoReducer(stateWith([T1, T2]), { type: 'OPTIMISTIC_DELETE', id: T1.id });
  expect(next.todos).toEqual([T2]);
  expect(next.optimisticPending.has(T1.id)).toBe(true);
});

test('CONFIRM_DELETE removes from pending (row already gone)', () => {
  const start: TodoState = { ...initialState, todos: [T2], optimisticPending: new Set([T1.id]) };
  const next = todoReducer(start, { type: 'CONFIRM_DELETE', id: T1.id });
  expect(next.todos).toEqual([T2]);
  expect(next.optimisticPending.has(T1.id)).toBe(false);
});

test('ROLLBACK_DELETE re-inserts the row in newest-first order + sets error', () => {
  const start: TodoState = {
    ...initialState,
    todos: [T3, T1],
    optimisticPending: new Set([T2.id]),
  };
  const next = todoReducer(start, { type: 'ROLLBACK_DELETE', todo: T2, reason: 'rejected' });
  // Order is by created_at DESC: T3 (300), T2 (200), T1 (100)
  expect(next.todos.map((t) => t.id)).toEqual([T3.id, T2.id, T1.id]);
  expect(next.error).toBe('rejected');
});

test('OPTIMISTIC_DELETE_ALL clears all todos', () => {
  const next = todoReducer(stateWith([T1, T2, T3]), { type: 'OPTIMISTIC_DELETE_ALL' });
  expect(next.todos).toEqual([]);
});

test('CONFIRM_DELETE_ALL is a no-op (state already cleared)', () => {
  const start = stateWith([]);
  const next = todoReducer(start, { type: 'CONFIRM_DELETE_ALL' });
  expect(next).toBe(start);
});

test('ROLLBACK_DELETE_ALL restores all rows + sets error', () => {
  const next = todoReducer(stateWith([]), {
    type: 'ROLLBACK_DELETE_ALL',
    todos: [T3, T2, T1],
    reason: 'rejected',
  });
  expect(next.todos).toEqual([T3, T2, T1]);
  expect(next.error).toBe('rejected');
});

test('ERROR_DISMISS clears the error', () => {
  const next = todoReducer({ ...initialState, error: 'oops' }, { type: 'ERROR_DISMISS' });
  expect(next.error).toBeNull();
});

test('OPTIMISTIC actions do not mutate the prior pending Set', () => {
  const prevPending = new Set([T2.id]);
  const start: TodoState = { ...initialState, optimisticPending: prevPending };
  todoReducer(start, { type: 'OPTIMISTIC_CREATE', todo: T1 });
  // prior set must be unchanged
  expect(prevPending.has(T1.id)).toBe(false);
  expect(prevPending.size).toBe(1);
});
