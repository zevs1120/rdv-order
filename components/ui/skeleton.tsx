import type { HTMLAttributes } from "react";

type Props = HTMLAttributes<HTMLDivElement> & {
  h?: number;
};

export function Skeleton({ h = 16, className = "", style, ...rest }: Props) {
  return (
    <div
      className={["ui-skeleton", className].filter(Boolean).join(" ")}
      style={{ height: h, ...style }}
      {...rest}
    />
  );
}
