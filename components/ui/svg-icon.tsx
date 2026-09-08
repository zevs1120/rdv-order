import type { CSSProperties } from "react";

type IconName = "settings" | "refresh-cw" | "globe" | "grid-2x2" | "check" |
  "ellipsis-vertical" | "chevron-left" | "plus" | "minus" | "x" | "loader-circle" | "circle" | "search";

/** Individual official Lucide SVGs; no icon font, runtime library or hand-built paths. */
export function SvgIcon({ name, className = "" }: { name: IconName; className?: string }) {
  return <span aria-hidden="true" className={`rdv-icon ${className}`}
    style={{ "--icon-url": `url("/icons/${name}.svg")` } as CSSProperties} />;
}
