"use client";

import { useConnectionRefresh } from "../../../lib/use-connection-refresh";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetchJson, getStoredAuth } from "../../../lib/client-api";
import { useI18n } from "../../components/i18n-provider";
import { useActionGuard } from "../../../lib/use-action-guard";
import { RDV_TOPBAR_ACTION_EVENT, type TopbarActionDetail } from "../../../lib/topbar-events";

type PermissionRow = {
  role: "waiter" | "manager";
  permission: string;
  allowed: boolean;
};

type PermissionMeta = {
  zh: string;
  zhDesc: string;
  en: string;
};

const PERMISSION_META: Record<string, PermissionMeta> = {
  "order.create": { zh: "点餐", zhDesc: "创建新订单并提交到打印队列", en: "Create order" },
  "order.return_item": { zh: "退菜", zhDesc: "对未结账订单执行退菜", en: "Return item" },
  "order.cancel": { zh: "取消单", zhDesc: "整单取消并记录原因", en: "Cancel order" },
  "order.adjust_charge": { zh: "改价/费用", zhDesc: "添加折扣、服务费或税费", en: "Adjust charges" },
  "order.split_merge": { zh: "分单并单", zhDesc: "执行分单、并单操作", en: "Split/Merge order" },
  "order.delete": { zh: "删单", zhDesc: "彻底删除订单（不可恢复）", en: "Delete order" },
  "cashier.reverse_checkout": { zh: "反结账", zhDesc: "已结账订单回滚到可编辑状态", en: "Reverse checkout" },
  "cashier.close_shift": { zh: "日结交班", zhDesc: "查看并提交日结数据、编辑收费规则", en: "Shift close" },
  "kitchen.view": { zh: "厨房查看", zhDesc: "历史兼容权限，当前业务不使用", en: "Kitchen view (legacy)" },
  "kitchen.update": { zh: "厨房更新", zhDesc: "历史兼容权限，当前业务不使用", en: "Kitchen update (legacy)" },
  "kitchen.rush": { zh: "厨房催菜", zhDesc: "历史兼容权限，当前业务不使用", en: "Kitchen rush (legacy)" },
  "report.orders": { zh: "订单查看", zhDesc: "查看订单列表和订单明细", en: "View orders" },
  "report.finance": { zh: "收入查看", zhDesc: "查看收入统计", en: "View revenue" },
  "report.ops": { zh: "运营查看", zhDesc: "查看运营指标与热销", en: "View operations" },
  "menu.manage": { zh: "菜单管理", zhDesc: "新增、编辑、删除菜品与过敏原标记", en: "Manage menu" },
  "rbac.manage": { zh: "权限管理", zhDesc: "修改角色权限开关", en: "Manage RBAC" },
  "device.view": { zh: "设备查看", zhDesc: "查看打印设备状态与告警", en: "View devices" },
  "device.manage": { zh: "设备管理", zhDesc: "管理设备配置和策略", en: "Manage devices" }
};

export default function ManageRbacPage() {
  const router = useRouter();
  const { t, lang } = useI18n();
  const [rows, setRows] = useState<PermissionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [updatingKey, setUpdatingKey] = useState("");
  const [error, setError] = useState("");
  const canRunAction = useActionGuard();

  const grouped = useMemo(() => {
    const waiter: PermissionRow[] = [];
    const manager: PermissionRow[] = [];
    for (const row of rows) {
      if (row.role === "waiter") {
        waiter.push(row);
      } else {
        manager.push(row);
      }
    }
    return { waiter, manager };
  }, [rows]);

  useConnectionRefresh(loadRows, !loading && !updatingKey);

  async function loadRows() {
    setLoading(true);
    setError("");
    try {
      const { token, role } = getStoredAuth();
      if (!token || role !== "manager") {
        router.replace("/");
        return;
      }
      const body = await apiFetchJson<{ rows: PermissionRow[] }>("/api/admin/permissions", {
        timeoutMs: 6000,
        retries: 1
      });
      setRows(body.rows || []);
    } catch (err: any) {
      setError(err.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function toggle(row: PermissionRow) {
    if (!canRunAction()) return;
    const key = `${row.role}-${row.permission}`;
    setUpdatingKey(key);
    setError("");
    try {
      await apiFetchJson("/api/admin/permissions", {
        method: "PATCH",
        body: {
          role: row.role,
          permission: row.permission,
          allowed: !row.allowed
        },
        timeoutMs: 6000,
        retries: 0
      });
      setRows((prev) =>
        prev.map((item) =>
          item.role === row.role && item.permission === row.permission
            ? { ...item, allowed: !item.allowed }
            : item
        )
      );
    } catch (err: any) {
      setError(err.message || "更新失败");
    } finally {
      setUpdatingKey("");
    }
  }

  useEffect(() => {
    void loadRows();
  }, []);

  useEffect(() => {
    function onTopbarAction(event: Event) {
      const custom = event as CustomEvent<TopbarActionDetail>;
      if (custom.detail?.action === "rbac-refresh") {
        void loadRows();
      }
    }
    window.addEventListener(RDV_TOPBAR_ACTION_EVENT, onTopbarAction as EventListener);
    return () => window.removeEventListener(RDV_TOPBAR_ACTION_EVENT, onTopbarAction as EventListener);
  }, []);

  function roleLabel(role: "waiter" | "manager") {
    if (role === "waiter") {
      return lang === "en" ? "Waiter" : "服务员";
    }
    return lang === "en" ? "Manager" : "经理";
  }

  function renderRoleBlock(role: "waiter" | "manager") {
    const items = role === "waiter" ? grouped.waiter : grouped.manager;
    return (
      <div className="panel stack">
        <h3 style={{ margin: 0 }}>{roleLabel(role)}</h3>
        <div className="order-list">
          {items.map((row) => {
            const key = `${row.role}-${row.permission}`;
            const meta = PERMISSION_META[row.permission] || {
              zh: row.permission,
              zhDesc: "未定义说明",
              en: row.permission
            };
            return (
              <div key={key} className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                <div className="stack" style={{ gap: 2 }}>
                  <span>{meta.zh}</span>
                  <span className="muted">{meta.zhDesc}</span>
                  {lang === "en" ? <span className="muted">{meta.en}</span> : null}
                </div>
                <button
                  type="button"
                  className={row.allowed ? "ios-switch on" : "ios-switch"}
                  disabled={updatingKey === key}
                  onClick={() => { void toggle(row); }}
                  aria-pressed={row.allowed}
                  aria-label={`${meta.zh} ${row.allowed ? "enabled" : "disabled"}`}
                />
              </div>
            );
          })}
          {items.length === 0 ? <div className="muted">-</div> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="stack manage-subpage-screen">
      <div className="manage-subpage-scroll stack">
        {loading ? <div className="muted">{t("common.loading", "加载中...")}</div> : null}
        {error ? <div className="muted">{error}</div> : null}

        {renderRoleBlock("waiter")}
        {renderRoleBlock("manager")}
      </div>

    </div>
  );
}
