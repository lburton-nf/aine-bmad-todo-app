import { useEffect, useRef, useState } from 'react';

const MAX_DESCRIPTION = 280;

interface Props {
  /** Called with a non-empty description when the user submits via Enter. */
  onSubmit: (description: string) => void;
}

export function TodoInput({ onSubmit }: Props) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    const trimmed = value.trim();
    if (trimmed.length === 0) return;
    onSubmit(value);
    setValue('');
    inputRef.current?.focus();
  }

  return (
    <input
      ref={inputRef}
      type="text"
      className="todo-input"
      placeholder="Add a todo…"
      value={value}
      maxLength={MAX_DESCRIPTION}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      aria-label="Add a todo"
    />
  );
}
