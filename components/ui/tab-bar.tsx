import type { ReactNode } from "react";

type Item = {
  key: string;
  label: ReactNode;
};

type Props = {
  items: Item[];
  activeKey: string;
  onChange: (key: string) => void;
  className?: string;
};

export function TabBar({ items, activeKey, onChange, className = "" }: Props) {
  return (
    <div className={["ui-tabbar", className].filter(Boolean).join(" ")} role="tablist">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          role="tab"
          aria-selected={activeKey === item.key}
          className={activeKey === item.key ? "ui-tabbar__tab is-active" : "ui-tabbar__tab"}
          onClick={() => onChange(item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
