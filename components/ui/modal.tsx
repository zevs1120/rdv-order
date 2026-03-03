import type { ReactNode } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
};

export function Modal({ open, onClose, title, children, footer }: Props) {
  if (!open) return null;
  return (
    <>
      <button type="button" className="ui-overlay" onClick={onClose} aria-label="Close" />
      <section className="ui-modal" role="dialog" aria-modal="true">
        {title ? <header className="ui-modal__title">{title}</header> : null}
        <div className="ui-modal__body">{children}</div>
        {footer ? <footer className="ui-modal__footer">{footer}</footer> : null}
      </section>
    </>
  );
}
