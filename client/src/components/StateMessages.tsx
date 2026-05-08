interface ErrorStateProps {
  message: string;
  onRetry: () => void;
  onDismiss: () => void;
}

export function EmptyState() {
  return (
    <p className="state-message state-message--empty" aria-live="polite">
      No todos yet.
    </p>
  );
}

export function LoadingState() {
  return (
    <p className="state-message state-message--loading" aria-live="polite">
      Loading…
    </p>
  );
}

export function ErrorState({ message, onRetry, onDismiss }: ErrorStateProps) {
  return (
    <div className="state-message state-message--error" role="alert">
      <span className="state-message__icon" aria-hidden="true">
        ⚠
      </span>
      <span className="state-message__text">{message}</span>
      <button type="button" className="state-message__retry" onClick={onRetry}>
        Retry
      </button>
      <button
        type="button"
        className="state-message__dismiss"
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
