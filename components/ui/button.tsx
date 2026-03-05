import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  fullWidth?: boolean;
  loading?: boolean;
  disableWhenLoading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
};

export function Button({
  variant = "primary",
  fullWidth = false,
  loading = false,
  disableWhenLoading = true,
  iconLeft,
  iconRight,
  className = "",
  children,
  disabled,
  ...rest
}: Props) {
  const classes = [
    "ui-btn",
    `ui-btn--${variant}`,
    fullWidth ? "ui-btn--full" : "",
    loading ? "ui-btn--loading" : "",
    className
  ].filter(Boolean).join(" ");

  return (
    <button className={classes} disabled={disabled || (loading && disableWhenLoading)} {...rest}>
      {loading ? <span className="ui-btn__spinner" aria-hidden="true" /> : (iconLeft ? <span className="ui-btn__icon">{iconLeft}</span> : null)}
      <span>{children}</span>
      {iconRight ? <span className="ui-btn__icon">{iconRight}</span> : null}
    </button>
  );
}
