import type { ReactNode } from "react";

type Props = {
  left?: ReactNode;
  title?: ReactNode;
  right?: ReactNode;
  subline?: ReactNode;
  className?: string;
};

export function AppBar({ left, title, right, subline, className = "" }: Props) {
  return (
    <header className={["ui-appbar", className].filter(Boolean).join(" ")}>
      <div className="ui-appbar__row">
        <div className="ui-appbar__left">{left}</div>
        <div className="ui-appbar__title">{title}</div>
        <div className="ui-appbar__right">{right}</div>
      </div>
      {subline ? <div className="ui-appbar__subline">{subline}</div> : null}
    </header>
  );
}
