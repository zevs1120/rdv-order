"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "./i18n-provider";

type Props = {
  global?: boolean;
};

export default function BottomNav({ global = false }: Props) {
  if (!global) return null;

  const pathname = usePathname();
  const { t } = useI18n();
  const tablesActive = pathname.startsWith("/tables") || pathname.startsWith("/order");
  const manageActive = pathname.startsWith("/manage") || pathname.startsWith("/summary") || pathname.startsWith("/admin");

  return (
    <div className="bottom-nav-shell">
      <nav className="bottom-nav" aria-label="Main navigation">
        <Link href="/tables" className={tablesActive ? "bottom-nav-item active" : "bottom-nav-item"}>
          {t("nav.tables", "桌台")}
        </Link>
        <Link href="/manage" className={manageActive ? "bottom-nav-item active" : "bottom-nav-item"}>
          {t("nav.more", "更多")}
        </Link>
      </nav>
    </div>
  );
}
