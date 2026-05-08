// Optimistic-UI reducer. Every mutation flows: OPTIMISTIC_* → API → CONFIRM_* | ROLLBACK_*.
// ROLLBACK actions carry the inverse data so the reducer stays pure.

import type { Todo } from '../../shared/types';

export interface TodoState {
  todos: Todo[];
  loading: boolean;
  error: string | null;
  /** Set of todo ids whose API call is in flight. Rendered at opacity 0.6. */
  optimisticPending: Set<string>;
}

export const initialState: TodoState = {
  todos: [],
  loading: false,
  error: null,
  optimisticPending: new Set(),
};

export type Action =
  | { type: 'LOAD_REQUEST' }
  | { type: 'LOAD_SUCCESS'; todos: Todo[] }
  | { type: 'LOAD_FAILURE'; error: string }
  | { type: 'OPTIMISTIC_CREATE'; todo: Todo }
  | { type: 'CONFIRM_CREATE'; id: string; todo: Todo }
  | { type: 'ROLLBACK_CREATE'; id: string; reason: string }
  | { type: 'OPTIMISTIC_TOGGLE'; id: string }
  | { type: 'CONFIRM_TOGGLE'; id: string; todo: Todo }
  | { type: 'ROLLBACK_TOGGLE'; id: string; reason: string }
  | { type: 'OPTIMISTIC_DELETE'; id: string }
  | { type: 'CONFIRM_DELETE'; id: string }
  | { type: 'ROLLBACK_DELETE'; todo: Todo; reason: string }
  | { type: 'OPTIMISTIC_DELETE_ALL' }
  | { type: 'CONFIRM_DELETE_ALL' }
  | { type: 'ROLLBACK_DELETE_ALL'; todos: Todo[]; reason: string }
  | { type: 'ERROR_DISMISS' };

function withoutPending(set: Set<string>, id: string): Set<string> {
  if (!set.has(id)) return set;
  const next = new Set(set);
  next.delete(id);
  return next;
}

function withPending(set: Set<string>, id: string): Set<string> {
  if (set.has(id)) return set;
  const next = new Set(set);
  next.add(id);
  return next;
}

export function todoReducer(state: TodoState, action: Action): TodoState {
  switch (action.type) {
    case 'LOAD_REQUEST':
      return { ...state, loading: true, error: null };
    case 'LOAD_SUCCESS':
      return { ...state, loading: false, todos: action.todos };
    case 'LOAD_FAILURE':
      return { ...state, loading: false, error: action.error };

    case 'OPTIMISTIC_CREATE':
      return {
        ...state,
        todos: [action.todo, ...state.todos],
        optimisticPending: withPending(state.optimisticPending, action.todo.id),
      };
    case 'CONFIRM_CREATE':
      return {
        ...state,
        todos: state.todos.map((t) => (t.id === action.id ? action.todo : t)),
        optimisticPending: withoutPending(state.optimisticPending, action.id),
      };
    case 'ROLLBACK_CREATE':
      return {
        ...state,
        todos: state.todos.filter((t) => t.id !== action.id),
        optimisticPending: withoutPending(state.optimisticPending, action.id),
        error: action.reason,
      };

    case 'OPTIMISTIC_TOGGLE':
      return {
        ...state,
        todos: state.todos.map((t) => (t.id === action.id ? { ...t, completed: !t.completed } : t)),
        optimisticPending: withPending(state.optimisticPending, action.id),
      };
    case 'CONFIRM_TOGGLE':
      return {
        ...state,
        todos: state.todos.map((t) => (t.id === action.id ? action.todo : t)),
        optimisticPending: withoutPending(state.optimisticPending, action.id),
      };
    case 'ROLLBACK_TOGGLE':
      return {
        ...state,
        todos: state.todos.map((t) => (t.id === action.id ? { ...t, completed: !t.completed } : t)),
        optimisticPending: withoutPending(state.optimisticPending, action.id),
        error: action.reason,
      };

    case 'OPTIMISTIC_DELETE':
      return {
        ...state,
        todos: state.todos.filter((t) => t.id !== action.id),
        optimisticPending: withPending(state.optimisticPending, action.id),
      };
    case 'CONFIRM_DELETE':
      return {
        ...state,
        optimisticPending: withoutPending(state.optimisticPending, action.id),
      };
    case 'ROLLBACK_DELETE':
      return {
        ...state,
        // Restore the row in newest-first order. created_at is its sort key.
        todos: [...state.todos, action.todo].sort((a, b) => b.created_at - a.created_at),
        optimisticPending: withoutPending(state.optimisticPending, action.todo.id),
        error: action.reason,
      };

    case 'OPTIMISTIC_DELETE_ALL':
      return { ...state, todos: [] };
    case 'CONFIRM_DELETE_ALL':
      return state;
    case 'ROLLBACK_DELETE_ALL':
      return { ...state, todos: action.todos, error: action.reason };

    case 'ERROR_DISMISS':
      return { ...state, error: null };

    default: {
      // Exhaustiveness check — unreachable if the union is fully handled.
      const _exhaustive: never = action;
      void _exhaustive;
      return state;
    }
  }
}
