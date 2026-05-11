import type { ReactNode } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
};

export function BottomSheet({ open, onClose, title, children, footer, className = "" }: Props) {
  if (!open) return null;
  return (
    <>
      <button type="button" className="ui-overlay" onClick={onClose} aria-label="Close" />
      <section className={["ui-sheet", className].filter(Boolean).join(" ")}>
        <button type="button" className="ui-sheet__handle" onClick={onClose} aria-label="Close" />
        {title ? <div className="ui-sheet__title">{title}</div> : null}
        <div className="ui-sheet__body">{children}</div>
        {footer ? <div className="ui-sheet__footer">{footer}</div> : null}
      </section>
    </>
  );
}
