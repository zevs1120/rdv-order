import type { HTMLAttributes } from "react";

type Props = HTMLAttributes<HTMLDivElement> & {
  padded?: boolean;
};

export function Card({ padded = true, className = "", ...rest }: Props) {
  return <div className={["ui-card", padded ? "ui-card--padded" : "", className].filter(Boolean).join(" ")} {...rest} />;
}
