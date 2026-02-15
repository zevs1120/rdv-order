"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useI18n } from "./i18n-provider";

export default function ManageTabs() {
  const pathname = usePathname();
  const { t } = useI18n();
  const [role, setRole] = useState("");

  useEffect(() => {
    setRole(localStorage.getItem("rdv_role") || "");
  }, []);

  return (
    <div className="row" style={{ flexWrap: "wrap" }}>
      <Link href="/manage/orders" className={pathname === "/manage/orders" ? "manage-tab active" : "manage-tab"}>
        {t("manage.orders", "今天订单")}
      </Link>
      {role === "manager" ? (
        <Link href="/manage/income" className={pathname === "/manage/income" ? "manage-tab active" : "manage-tab"}>
          {t("manage.income", "收入")}
        </Link>
      ) : null}
      {role === "manager" ? (
        <Link href="/admin/menu" className={pathname === "/admin/menu" ? "manage-tab active" : "manage-tab"}>
          {t("manage.menu", "菜单管理")}
        </Link>
      ) : null}
    </div>
  );
}
