import type { ButtonHTMLAttributes, ReactNode } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  icon: ReactNode;
};

export function IconButton({ label, icon, className = "", ...rest }: Props) {
  return (
    <button className={["ui-icon-btn", className].filter(Boolean).join(" ")} aria-label={label} {...rest}>
      {icon}
    </button>
  );
}
