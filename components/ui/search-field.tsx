import type { InputHTMLAttributes } from "react";
import { SvgIcon } from "./svg-icon";

type SearchFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  onClear?: () => void;
  clearLabel?: string;
};

export function SearchField({ className = "", onClear, clearLabel = "Clear search", ...rest }: SearchFieldProps) {
  return (
    <div className={["ui-search", onClear && "ui-search--clearable", className].filter(Boolean).join(" ")}>
      <SvgIcon name="search" className="ui-search__icon" />
      <input className="ui-search__input" inputMode="search" enterKeyHint="search" {...rest} />
      {onClear ? <button type="button" className="ui-search__clear" aria-label={clearLabel} onClick={onClear}>
        <SvgIcon name="x" />
      </button> : null}
    </div>
  );
}
