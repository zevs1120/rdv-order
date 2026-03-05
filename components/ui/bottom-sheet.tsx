import { useRef, useState, type PointerEvent, type ReactNode } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
};

export function BottomSheet({ open, onClose, title, children, footer, className = "" }: Props) {
  const [offsetY, setOffsetY] = useState(0);
  const dragStartYRef = useRef<number | null>(null);
  const draggingRef = useRef(false);

  function onHandlePointerDown(event: PointerEvent<HTMLDivElement>) {
    dragStartYRef.current = event.clientY;
    draggingRef.current = true;
    (event.target as HTMLDivElement).setPointerCapture?.(event.pointerId);
  }

  function onHandlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current || dragStartYRef.current === null) return;
    const delta = event.clientY - dragStartYRef.current;
    setOffsetY(delta > 0 ? Math.min(delta, 220) : 0);
  }

  function onHandlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    (event.target as HTMLDivElement).releasePointerCapture?.(event.pointerId);
    if (offsetY > 96) {
      setOffsetY(0);
      onClose();
      return;
    }
    setOffsetY(0);
  }

  if (!open) return null;
  return (
    <>
      <button type="button" className="ui-overlay" onClick={onClose} aria-label="Close" />
      <section
        className={["ui-sheet", className].filter(Boolean).join(" ")}
        style={{ transform: offsetY ? `translateY(${offsetY}px)` : undefined }}
      >
        <div
          className="ui-sheet__handle"
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={onHandlePointerUp}
        />
        {title ? <div className="ui-sheet__title">{title}</div> : null}
        <div className="ui-sheet__body">{children}</div>
        {footer ? <div className="ui-sheet__footer">{footer}</div> : null}
      </section>
    </>
  );
}
