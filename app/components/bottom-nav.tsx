"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "./i18n-provider";

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const tablesActive = pathname.startsWith("/tables");
  const orderActive = pathname.startsWith("/order");
  const manageActive = pathname.startsWith("/manage") || pathname.startsWith("/summary") || pathname.startsWith("/admin");
  const [recentTableNo, setRecentTableNo] = useState("");
  const [recentGuests, setRecentGuests] = useState(2);

  useEffect(() => {
    const tableNo = localStorage.getItem("rdv_recent_table") || "";
    const guests = Number(localStorage.getItem("rdv_recent_guests") || 2);
    setRecentTableNo(tableNo);
    setRecentGuests(Number.isInteger(guests) && guests > 0 ? guests : 2);
  }, [pathname]);

  const orderHref = useMemo(() => {
    if (!recentTableNo) return "/tables";
    return `/order?tableNo=${encodeURIComponent(recentTableNo)}&guests=${recentGuests}`;
  }, [recentGuests, recentTableNo]);

  return (
    <nav className="bottom-nav" aria-label="主导航">
      <Link href="/tables" className={tablesActive ? "bottom-nav-item active" : "bottom-nav-item"}>
        {t("nav.tables", "桌台")}
      </Link>
      <button
        type="button"
        className={orderActive ? "bottom-nav-item active" : "bottom-nav-item"}
        onClick={() => router.push(orderHref)}
      >
        {t("nav.order", "点餐")}
      </button>
      <Link href="/manage" className={manageActive ? "bottom-nav-item active" : "bottom-nav-item"}>
        {t("nav.more", "更多")}
      </Link>
    </nav>
  );
}
