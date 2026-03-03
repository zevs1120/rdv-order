"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useI18n } from "./i18n-provider";

export default function ManageTabs() {
  const pathname = usePathname();
  const { t } = useI18n();
  const [role] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("rdv_role") || "";
  });

  return (
    <div className="row manage-tabs-wrap">
      <Link href="/manage/orders" className={pathname === "/manage/orders" ? "manage-tab active" : "manage-tab"}>
        {t("manage.orders", "订单")}
      </Link>
      {role === "manager" ? (
        <Link href="/manage/income" className={pathname === "/manage/income" ? "manage-tab active" : "manage-tab"}>
          {t("manage.income", "收入")}
        </Link>
      ) : null}
      {role === "manager" ? (
        <Link href="/manage/cashier" className={pathname === "/manage/cashier" ? "manage-tab active" : "manage-tab"}>
          {t("manage.cashier", "收银")}
        </Link>
      ) : null}
      {role === "manager" ? (
        <Link href="/manage/ops" className={pathname === "/manage/ops" ? "manage-tab active" : "manage-tab"}>
          {t("manage.ops", "运营")}
        </Link>
      ) : null}
      {role === "manager" ? (
        <Link href="/manage/devices" className={pathname === "/manage/devices" ? "manage-tab active" : "manage-tab"}>
          {t("manage.devices", "设备")}
        </Link>
      ) : null}
      {role === "manager" ? (
        <Link href="/manage/rbac" className={pathname === "/manage/rbac" ? "manage-tab active" : "manage-tab"}>
          {t("manage.rbac", "权限")}
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
