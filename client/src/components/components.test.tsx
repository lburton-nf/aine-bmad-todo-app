import { test, expect, vi, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { TodoInput } from './TodoInput';
import { TodoItem } from './TodoItem';
import { TodoList } from './TodoList';
import { EmptyState, LoadingState, ErrorState } from './StateMessages';
import { DeleteAllControl } from './DeleteAllControl';
import type { Todo } from '../../../shared/types';

const T1: Todo = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
  description: 'first',
  created_at: 100,
  completed: false,
};
const T2: Todo = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
  description: 'second',
  created_at: 200,
  completed: true,
};

let root: Root | null = null;
let container: HTMLElement | null = null;

function mount(node: React.ReactNode): HTMLElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container!);
    root.render(node);
  });
  return container;
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  if (container) container.remove();
  root = null;
  container = null;
});

// ─── TodoInput ───

test('TodoInput auto-focuses on mount and shows the placeholder', () => {
  const c = mount(<TodoInput onSubmit={() => {}} />);
  const input = c.querySelector<HTMLInputElement>('input');
  expect(input).not.toBeNull();
  expect(input?.placeholder).toBe('Add a todo…');
  expect(document.activeElement).toBe(input);
  expect(input?.maxLength).toBe(280);
});

// React controlled inputs use an internal value tracker; direct `el.value = ...`
// is bypassed by React. Use the native HTMLInputElement setter so React's
// onChange picks up the change.
function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )?.set?.bind(input);
  setter?.(value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

test('TodoInput submits trimmed value on Enter and clears the field', () => {
  const onSubmit = vi.fn();
  const c = mount(<TodoInput onSubmit={onSubmit} />);
  const input = c.querySelector<HTMLInputElement>('input')!;
  act(() => {
    setInputValue(input, 'milk');
  });
  act(() => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  expect(onSubmit).toHaveBeenCalledWith('milk');
  expect(input.value).toBe('');
});

test('TodoInput Enter on empty/whitespace does NOT submit', () => {
  const onSubmit = vi.fn();
  const c = mount(<TodoInput onSubmit={onSubmit} />);
  const input = c.querySelector<HTMLInputElement>('input')!;
  act(() => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  act(() => {
    setInputValue(input, '   ');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  expect(onSubmit).not.toHaveBeenCalled();
});

// ─── TodoItem ───

test('TodoItem checkbox click invokes onToggle with the id', () => {
  const onToggle = vi.fn();
  const c = mount(<TodoItem todo={T1} pending={false} onToggle={onToggle} onDelete={() => {}} />);
  const checkbox = c.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  act(() => {
    checkbox.click();
  });
  expect(onToggle).toHaveBeenCalledWith(T1.id);
});

test('Mo9: clicking the description text toggles via the label wrapper', () => {
  const onToggle = vi.fn();
  const c = mount(<TodoItem todo={T1} pending={false} onToggle={onToggle} onDelete={() => {}} />);
  const description = c.querySelector<HTMLSpanElement>('.todo-item__description')!;
  act(() => {
    description.click();
  });
  expect(onToggle).toHaveBeenCalledWith(T1.id);
});

test('TodoItem delete button click invokes onDelete with the id', () => {
  const onDelete = vi.fn();
  const c = mount(<TodoItem todo={T1} pending={false} onToggle={() => {}} onDelete={onDelete} />);
  const button = c.querySelector<HTMLButtonElement>('button[aria-label^="Delete"]')!;
  act(() => {
    button.click();
  });
  expect(onDelete).toHaveBeenCalledWith(T1.id);
  // Mo8: aria-label is contextual (carries the description) so a screen reader
  // user knows which row is being deleted.
  expect(button.getAttribute('aria-label')).toBe(`Delete "${T1.description}"`);
});

test('TodoItem applies the pending class when pending=true', () => {
  const c = mount(<TodoItem todo={T1} pending={true} onToggle={() => {}} onDelete={() => {}} />);
  const li = c.querySelector('li')!;
  expect(li.className).toContain('todo-item--pending');
});

test('TodoItem renders completed style when todo.completed=true', () => {
  const c = mount(<TodoItem todo={T2} pending={false} onToggle={() => {}} onDelete={() => {}} />);
  const checkbox = c.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  expect(checkbox.checked).toBe(true);
  const desc = c.querySelector('.todo-item__description')!;
  expect(desc.className).toContain('todo-item__description--done');
});

// ─── TodoList ───

test('TodoList renders rows in the order provided (newest-first is the caller responsibility)', () => {
  const c = mount(
    <TodoList
      todos={[T2, T1]}
      pending={new Set()}
      onToggle={() => {}}
      onDelete={() => {}}
      loading={false}
    />,
  );
  const rows = Array.from(c.querySelectorAll('li[data-todo-id]'));
  expect(rows.map((r) => r.getAttribute('data-todo-id'))).toEqual([T2.id, T1.id]);
});

test('TodoList sets aria-busy when loading', () => {
  const c = mount(
    <TodoList
      todos={[]}
      pending={new Set()}
      onToggle={() => {}}
      onDelete={() => {}}
      loading={true}
    />,
  );
  const ul = c.querySelector('ul')!;
  expect(ul.getAttribute('aria-busy')).toBe('true');
});

// ─── StateMessages ───

test('EmptyState renders the empty text with aria-live=polite', () => {
  const c = mount(<EmptyState />);
  expect(c.textContent).toBe('No todos yet.');
  expect(c.querySelector('p')?.getAttribute('aria-live')).toBe('polite');
});

test('LoadingState renders the loading text', () => {
  const c = mount(<LoadingState />);
  expect(c.textContent).toBe('Loading…');
});

test('ErrorState renders message + retry/dismiss; click handlers fire correctly', () => {
  const onRetry = vi.fn();
  const onDismiss = vi.fn();
  const c = mount(<ErrorState message="boom" onRetry={onRetry} onDismiss={onDismiss} />);
  expect(c.querySelector('[role="alert"]')).not.toBeNull();
  expect(c.textContent).toContain('boom');
  const retry = c.querySelector<HTMLButtonElement>('.state-message__retry')!;
  const dismiss = c.querySelector<HTMLButtonElement>('.state-message__dismiss')!;
  act(() => {
    retry.click();
  });
  act(() => {
    dismiss.click();
  });
  expect(onRetry).toHaveBeenCalled();
  expect(onDismiss).toHaveBeenCalled();
});

// ─── DeleteAllControl ───

test('Mi6: DeleteAllControl expands to confirm row on click; focus moves to Cancel (safe default)', () => {
  const c = mount(<DeleteAllControl onConfirm={() => {}} />);
  const link = c.querySelector<HTMLButtonElement>('.delete-all-link')!;
  act(() => {
    link.click();
  });
  const cancel = c.querySelector<HTMLButtonElement>('.delete-all-confirm__cancel');
  expect(cancel).not.toBeNull();
  // Cancel — not Erase — is the focused default so an accidental Enter
  // collapses the confirm row instead of destroying the user's data.
  expect(document.activeElement).toBe(cancel);
});

test('DeleteAllControl Erase fires onConfirm and collapses', () => {
  const onConfirm = vi.fn();
  const c = mount(<DeleteAllControl onConfirm={onConfirm} />);
  act(() => {
    c.querySelector<HTMLButtonElement>('.delete-all-link')!.click();
  });
  act(() => {
    c.querySelector<HTMLButtonElement>('.delete-all-confirm__erase')!.click();
  });
  expect(onConfirm).toHaveBeenCalled();
  // Collapsed back to the link
  expect(c.querySelector('.delete-all-link')).not.toBeNull();
});

test('DeleteAllControl Cancel collapses without firing onConfirm', () => {
  const onConfirm = vi.fn();
  const c = mount(<DeleteAllControl onConfirm={onConfirm} />);
  act(() => {
    c.querySelector<HTMLButtonElement>('.delete-all-link')!.click();
  });
  act(() => {
    c.querySelector<HTMLButtonElement>('.delete-all-confirm__cancel')!.click();
  });
  expect(onConfirm).not.toHaveBeenCalled();
  expect(c.querySelector('.delete-all-link')).not.toBeNull();
});

test('DeleteAllControl Escape collapses the confirm row', () => {
  const c = mount(<DeleteAllControl onConfirm={() => {}} />);
  act(() => {
    c.querySelector<HTMLButtonElement>('.delete-all-link')!.click();
  });
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  });
  expect(c.querySelector('.delete-all-link')).not.toBeNull();
  expect(c.querySelector('.delete-all-confirm')).toBeNull();
});
