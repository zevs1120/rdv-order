import type { ReactNode } from "react";

type Props = {
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  className?: string;
};

export function ListRow({ title, subtitle, trailing, onClick, className = "" }: Props) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      className={["ui-list-row", onClick ? "is-clickable" : "", className].filter(Boolean).join(" ")}
      onClick={onClick}
      type={onClick ? "button" : undefined}
    >
      <div className="ui-list-row__main">
        <div className="ui-list-row__title">{title}</div>
        {subtitle ? <div className="ui-list-row__subtitle">{subtitle}</div> : null}
      </div>
      {trailing ? <div className="ui-list-row__trailing">{trailing}</div> : null}
    </Comp>
  );
}
