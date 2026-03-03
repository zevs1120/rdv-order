import type { ReactNode } from "react";

type Tone = "neutral" | "success" | "warning" | "danger" | "brand";

type Props = {
  tone?: Tone;
  children: ReactNode;
};

export function Badge({ tone = "neutral", children }: Props) {
  return <span className={`ui-badge ui-badge--${tone}`}>{children}</span>;
}
