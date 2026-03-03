import type { InputHTMLAttributes } from "react";

export function SearchField({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={["ui-search", className].filter(Boolean).join(" ")}>
      <span className="ui-search__icon" aria-hidden="true">⌕</span>
      <input className="ui-search__input" inputMode="search" enterKeyHint="search" {...rest} />
    </div>
  );
}
