import { useCallback, useEffect, useReducer } from 'react';
import './App.css';
import { todoReducer, initialState } from './reducer';
import * as api from './api';
import { ApiError } from './api';
import { TodoInput } from './components/TodoInput';
import { TodoList } from './components/TodoList';
import { EmptyState, LoadingState, ErrorState } from './components/StateMessages';
import { DeleteAllControl } from './components/DeleteAllControl';
import type { Todo } from '../../shared/types';

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.category === 'network') return 'Network error — check your connection.';
    if (err.category === 'timeout') return 'Request timed out.';
    return err.message || 'Server error.';
  }
  return 'Something went wrong.';
}

function App() {
  const [state, dispatch] = useReducer(todoReducer, initialState);

  const load = useCallback(async () => {
    dispatch({ type: 'LOAD_REQUEST' });
    try {
      const todos = await api.listTodos();
      dispatch({ type: 'LOAD_SUCCESS', todos });
    } catch (err) {
      dispatch({ type: 'LOAD_FAILURE', error: errorMessage(err) });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Escape dismisses the error globally.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && state.error !== null) {
        dispatch({ type: 'ERROR_DISMISS' });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.error]);

  const handleCreate = useCallback((description: string) => {
    const todo: Todo = {
      id: crypto.randomUUID(),
      description,
      created_at: Date.now(),
      completed: false,
    };
    dispatch({ type: 'OPTIMISTIC_CREATE', todo });
    void (async () => {
      try {
        const persisted = await api.createTodo({ id: todo.id, description });
        dispatch({ type: 'CONFIRM_CREATE', id: todo.id, todo: persisted });
      } catch (err) {
        dispatch({ type: 'ROLLBACK_CREATE', id: todo.id, reason: errorMessage(err) });
      }
    })();
  }, []);

  const handleToggle = useCallback(
    (id: string) => {
      const current = state.todos.find((t) => t.id === id);
      if (!current) return;
      const nextCompleted = !current.completed;
      dispatch({ type: 'OPTIMISTIC_TOGGLE', id });
      void (async () => {
        try {
          const persisted = await api.toggleCompleted(id, nextCompleted);
          dispatch({ type: 'CONFIRM_TOGGLE', id, todo: persisted });
        } catch (err) {
          dispatch({ type: 'ROLLBACK_TOGGLE', id, reason: errorMessage(err) });
        }
      })();
    },
    [state.todos],
  );

  const handleDelete = useCallback(
    (id: string) => {
      const snapshot = state.todos.find((t) => t.id === id);
      if (!snapshot) return;
      dispatch({ type: 'OPTIMISTIC_DELETE', id });
      void (async () => {
        try {
          await api.deleteTodo(id);
          dispatch({ type: 'CONFIRM_DELETE', id });
        } catch (err) {
          dispatch({ type: 'ROLLBACK_DELETE', todo: snapshot, reason: errorMessage(err) });
        }
      })();
    },
    [state.todos],
  );

  const handleDeleteAll = useCallback(() => {
    const snapshot = state.todos;
    dispatch({ type: 'OPTIMISTIC_DELETE_ALL' });
    void (async () => {
      try {
        await api.deleteAll();
        dispatch({ type: 'CONFIRM_DELETE_ALL' });
      } catch (err) {
        dispatch({ type: 'ROLLBACK_DELETE_ALL', todos: snapshot, reason: errorMessage(err) });
      }
    })();
  }, [state.todos]);

  // Retry just reloads the list. After a rollback, the optimistic state is
  // reverted, so the user can re-attempt mutations by interacting again — and
  // the reload ensures their view matches the server.
  const handleRetry = useCallback(() => {
    dispatch({ type: 'ERROR_DISMISS' });
    void load();
  }, [load]);

  const handleDismiss = useCallback(() => {
    dispatch({ type: 'ERROR_DISMISS' });
  }, []);

  const showEmpty = !state.loading && state.error === null && state.todos.length === 0;
  const showList = !state.loading && state.todos.length > 0;

  return (
    <main className="app-shell">
      <h1 className="app-title">Todos</h1>

      <div className="app-slot" data-slot="input">
        <TodoInput onSubmit={handleCreate} />
      </div>

      <div className="app-slot" data-slot="state">
        {state.error !== null && (
          <ErrorState message={state.error} onRetry={handleRetry} onDismiss={handleDismiss} />
        )}
        {state.loading && <LoadingState />}
        {showEmpty && <EmptyState />}
      </div>

      {showList && (
        <div className="app-slot" data-slot="list">
          <TodoList
            todos={state.todos}
            pending={state.optimisticPending}
            onToggle={handleToggle}
            onDelete={handleDelete}
            loading={state.loading}
          />
        </div>
      )}

      {state.todos.length > 0 && (
        <div className="app-slot" data-slot="erase">
          <DeleteAllControl onConfirm={handleDeleteAll} />
        </div>
      )}
    </main>
  );
}

export default App;
