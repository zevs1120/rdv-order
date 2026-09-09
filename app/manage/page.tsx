"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredAuth } from "../../lib/client-api";
import { useI18n } from "../components/i18n-provider";
import { SvgIcon } from "../../components/ui/svg-icon";

type Entry = {
  href: string;
  labelZh: string;
  labelEn: string;
};

const MANAGER_ENTRIES: Entry[] = [
  { href: "/manage/orders", labelZh: "订单记录", labelEn: "Order history" },
  { href: "/manage/income", labelZh: "收入", labelEn: "Revenue" },
  { href: "/manage/fees", labelZh: "费用", labelEn: "Fees" },
  { href: "/manage/hot", labelZh: "热销", labelEn: "Hot Items" },
  { href: "/manage/devices", labelZh: "打印机", labelEn: "Printers" },
  { href: "/manage/rbac", labelZh: "权限", labelEn: "Access" },
  { href: "/admin/menu", labelZh: "菜单管理", labelEn: "Menu" },
  { href: "/manage/updates", labelZh: "更新管理", labelEn: "Updates" }
];

const WAITER_ENTRIES: Entry[] = [
  { href: "/manage/orders", labelZh: "订单记录", labelEn: "Order history" },
  { href: "/manage/updates", labelZh: "更新管理", labelEn: "Updates" }
];

export default function ManageIndexPage() {
  const router = useRouter();
  const { lang } = useI18n();
  const [role, setRole] = useState<"waiter" | "manager" | "">("");

  useEffect(() => {
    const { token, role: currentRole } = getStoredAuth();
    if (!token || (currentRole !== "manager" && currentRole !== "waiter")) {
      router.replace("/");
      return;
    }
    setRole(currentRole);
  }, [router]);

  const entries = useMemo(() => {
    if (role === "manager") return MANAGER_ENTRIES;
    return role === "waiter" ? WAITER_ENTRIES : [];
  }, [role]);

  return (
    <div className="stack manage-home-screen">
      <div className="manage-home-scroll stack">
        <nav className="settings-menu" aria-label={lang === "en" ? "Settings" : "设置"}>
          {entries.map((entry) => (
            <button
              key={entry.href}
              type="button"
              className="settings-menu-row"
              onClick={() => router.push(entry.href)}
            >
              <span>{lang === "en" ? entry.labelEn : entry.labelZh}</span>
              <SvgIcon name="chevron-left" className="settings-menu-chevron" />
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
