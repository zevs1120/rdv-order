import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
};

export function Chip({ active = false, className = "", ...rest }: Props) {
  return (
    <button
      type="button"
      className={["ui-chip", active ? "is-active" : "", className].filter(Boolean).join(" ")}
      {...rest}
    />
  );
}
