import type { ReactNode } from "react";

type Props = {
  open: boolean;
  message: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  onClose?: () => void;
};

export function Toast({ open, message, actionLabel, onAction, onClose }: Props) {
  if (!open) return null;
  return (
    <div className="ui-toast" role="status" aria-live="polite">
      <span className="ui-toast__message">{message}</span>
      {actionLabel && onAction ? (
        <button type="button" className="ui-toast__action" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
      {onClose ? (
        <button type="button" className="ui-toast__close" onClick={onClose} aria-label="close toast">
          ×
        </button>
      ) : null}
    </div>
  );
}
