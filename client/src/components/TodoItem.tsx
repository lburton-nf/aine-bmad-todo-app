import type { Todo } from '../../../shared/types';

interface Props {
  todo: Todo;
  pending: boolean;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

export function TodoItem({ todo, pending, onToggle, onDelete }: Props) {
  return (
    <li className={`todo-item${pending ? ' todo-item--pending' : ''}`} data-todo-id={todo.id}>
      <label className="todo-item__toggle">
        <input
          type="checkbox"
          className="todo-item__checkbox"
          checked={todo.completed}
          onChange={() => onToggle(todo.id)}
          aria-label={`Mark "${todo.description}" as ${todo.completed ? 'incomplete' : 'complete'}`}
        />
        <span
          className={`todo-item__description${todo.completed ? ' todo-item__description--done' : ''}`}
        >
          {todo.description}
        </span>
      </label>
      <button
        type="button"
        className="delete-glyph"
        onClick={() => onDelete(todo.id)}
        aria-label="Delete"
      >
        ×
      </button>
    </li>
  );
}
