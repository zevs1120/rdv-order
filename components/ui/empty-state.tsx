import type { ReactNode } from "react";

type Props = {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
};

export function EmptyState({ title, description, action }: Props) {
  return (
    <div className="ui-empty">
      <div className="ui-empty__title">{title}</div>
      {description ? <div className="ui-empty__desc">{description}</div> : null}
      {action ? <div className="ui-empty__action">{action}</div> : null}
    </div>
  );
}
