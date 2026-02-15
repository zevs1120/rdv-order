"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "./i18n-provider";

export default function BottomNav() {
  const pathname = usePathname();
  const { t } = useI18n();
  const orderActive = pathname.startsWith("/order") || pathname.startsWith("/tables");
  const manageActive = pathname.startsWith("/manage") || pathname.startsWith("/summary");

  return (
    <nav className="bottom-nav" aria-label="主导航">
      <Link href="/tables" className={orderActive ? "bottom-nav-item active" : "bottom-nav-item"}>
        {t("nav.order", "点餐")}
      </Link>
      <Link href="/manage/orders" className={manageActive ? "bottom-nav-item active" : "bottom-nav-item"}>
        {t("nav.manage", "管理")}
      </Link>
    </nav>
  );
}
