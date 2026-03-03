import type { InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
};

export function TextField({ label, className = "", ...rest }: Props) {
  return (
    <label className="ui-field">
      {label ? <span className="ui-field__label">{label}</span> : null}
      <input className={["ui-input", className].filter(Boolean).join(" ")} {...rest} />
    </label>
  );
}
