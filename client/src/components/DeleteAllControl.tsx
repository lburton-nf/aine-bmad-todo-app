import { useEffect, useRef, useState } from 'react';

interface Props {
  onConfirm: () => void;
}

export function DeleteAllControl({ onConfirm }: Props) {
  const [confirming, setConfirming] = useState(false);
  // Mi6: focus the safe (Cancel) action by default so an accidental Enter
  // can't destroy data. Erase is reachable via Tab.
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirming) cancelButtonRef.current?.focus();
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
        ref={cancelButtonRef}
        type="button"
        className="delete-all-confirm__cancel"
        onClick={() => setConfirming(false)}
      >
        Cancel
      </button>
    </div>
  );
}
