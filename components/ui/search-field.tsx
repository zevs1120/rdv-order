import type { InputHTMLAttributes } from "react";
import { SvgIcon } from "./svg-icon";

export function SearchField({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={["ui-search", className].filter(Boolean).join(" ")}>
      <SvgIcon name="search" className="ui-search__icon" />
      <input className="ui-search__input" inputMode="search" enterKeyHint="search" {...rest} />
    </div>
  );
}
