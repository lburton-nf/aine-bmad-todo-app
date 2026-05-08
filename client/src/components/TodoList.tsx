import type { Todo } from '../../../shared/types';
import { TodoItem } from './TodoItem';

interface Props {
  todos: Todo[];
  pending: Set<string>;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  loading: boolean;
}

export function TodoList({ todos, pending, onToggle, onDelete, loading }: Props) {
  return (
    <ul className="todo-list" aria-busy={loading || undefined}>
      {todos.map((todo) => (
        <TodoItem
          key={todo.id}
          todo={todo}
          pending={pending.has(todo.id)}
          onToggle={onToggle}
          onDelete={onDelete}
        />
      ))}
    </ul>
  );
}
