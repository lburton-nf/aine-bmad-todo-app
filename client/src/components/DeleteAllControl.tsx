import { useEffect, useRef, useState } from 'react';

interface Props {
  onConfirm: () => void;
}

export function DeleteAllControl({ onConfirm }: Props) {
  const [confirming, setConfirming] = useState(false);
  const eraseButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirming) eraseButtonRef.current?.focus();
  }, [confirming]);

  useEffect(() => {
    if (!confirming) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setConfirming(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirming]);

  if (!confirming) {
    return (
      <button type="button" className="delete-all-link" onClick={() => setConfirming(true)}>
        Erase my data
      </button>
    );
  }

  return (
    <div className="delete-all-confirm" role="group" aria-label="Confirm erase">
      <span className="delete-all-confirm__text">Erase all your todos? This cannot be undone.</span>
      <button
        ref={eraseButtonRef}
        type="button"
        className="delete-all-confirm__erase"
        onClick={() => {
          setConfirming(false);
          onConfirm();
        }}
      >
        Erase
      </button>
      <button
        type="button"
        className="delete-all-confirm__cancel"
        onClick={() => setConfirming(false)}
      >
        Cancel
      </button>
    </div>
  );
}
