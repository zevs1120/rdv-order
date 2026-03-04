"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import BottomNav from "../components/bottom-nav";
import { getStoredAuth } from "../../lib/client-api";
import { useI18n } from "../components/i18n-provider";
import { AppBar, Button, Card } from "../../components/ui";

type Entry = {
  href: string;
  labelZh: string;
  labelEn: string;
};

const MANAGER_ENTRIES: Entry[] = [
  { href: "/manage/orders", labelZh: "订单", labelEn: "Orders" },
  { href: "/manage/income", labelZh: "收入", labelEn: "Revenue" },
  { href: "/manage/fees", labelZh: "费用", labelEn: "Fees" },
  { href: "/manage/hot", labelZh: "热销", labelEn: "Hot Items" },
  { href: "/manage/devices", labelZh: "设备", labelEn: "Devices" },
  { href: "/manage/rbac", labelZh: "权限", labelEn: "Access" },
  { href: "/admin/menu", labelZh: "菜单管理", labelEn: "Menu" }
];

const WAITER_ENTRIES: Entry[] = [
  { href: "/manage/orders", labelZh: "订单", labelEn: "Orders" }
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
    return WAITER_ENTRIES;
  }, [role]);

  return (
    <div className="stack manage-home-screen">
      <AppBar title={lang === "en" ? "More" : "更多"} />

      <Card className="more-grid-card">
        <div className="more-grid">
          {entries.map((entry) => (
            <Button
              key={entry.href}
              variant="secondary"
              className="more-grid-btn"
              onClick={() => router.push(entry.href)}
            >
              {lang === "en" ? entry.labelEn : entry.labelZh}
            </Button>
          ))}
        </div>
      </Card>

      <BottomNav />
    </div>
  );
}
