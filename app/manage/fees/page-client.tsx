"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import BottomNav from "../../components/bottom-nav";
import { apiFetchJson, getStoredAuth } from "../../../lib/client-api";
import { useI18n } from "../../components/i18n-provider";
import { useActionGuard } from "../../../lib/use-action-guard";
import { Button } from "../../../components/ui";

type ChargeType = "discount" | "service_fee" | "tax";
type ChargeMode = "amount" | "percent";

type FeeRule = {
  id: string;
  name: string;
  charge_type: ChargeType;
  mode: ChargeMode;
  value: number;
  is_active: boolean;
  sort_order: number;
  updated_at?: string;
};

export default function ManageFeesPage() {
  const router = useRouter();
  const { t, lang } = useI18n();
  const canRunAction = useActionGuard();
  const [rules, setRules] = useState<FeeRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");
  const [sectionOpen, setSectionOpen] = useState(true);

  const activeCount = useMemo(
    () => rules.filter((rule) => rule.is_active).length,
    [rules]
  );

  async function loadRules() {
    setLoading(true);
    setError("");
    try {
      const { token, role } = getStoredAuth();
      if (!token || role !== "manager") {
        router.replace("/");
        return;
      }
      const body = await apiFetchJson<{ rules: FeeRule[] }>("/api/pricing/rules", {
        timeoutMs: 6000,
        retries: 1
      });
      setRules((body.rules || []).map((rule, index) => ({
        ...rule,
        sort_order: Number.isFinite(Number(rule.sort_order)) ? Number(rule.sort_order) : (index + 1) * 10
      })));
    } catch (err: any) {
      if (err.message === "未登录" || err.message === "Not signed in") {
        router.replace("/");
        return;
      }
      if (err.message === "无权限" || err.message === "Insufficient permission") {
        router.replace("/manage/orders");
        return;
      }
      setError(err.message || (lang === "en" ? "Failed to load fees" : "加载费用失败"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRules();
  }, []);

  function updateRule(index: number, patch: Partial<FeeRule>) {
    setRules((prev) =>
      prev.map((rule, i) => (i === index ? { ...rule, ...patch } : rule))
    );
  }

  function addRule() {
    const nextSort = rules.length === 0
      ? 10
      : Math.max(...rules.map((item) => Number(item.sort_order) || 0)) + 10;
    setRules((prev) => [
      ...prev,
      {
        id: "",
        name: "",
        charge_type: "service_fee",
        mode: "percent",
        value: 10,
        is_active: false,
        sort_order: nextSort
      }
    ]);
  }

  async function deleteRule(index: number) {
    if (!canRunAction()) return;
    const rule = rules[index];
    if (!rule) return;

    if (!rule.id) {
      setRules((prev) => prev.filter((_, i) => i !== index));
      return;
    }

    const ok = window.confirm(
      lang === "en"
        ? `Delete fee rule "${rule.name}"?`
        : `确认删除费用规则「${rule.name}」吗？`
    );
    if (!ok) return;

    setDeletingId(rule.id);
    setError("");
    try {
      await apiFetchJson(`/api/pricing/rules/${rule.id}`, {
        method: "DELETE",
        timeoutMs: 8000,
        retries: 0
      });
      setRules((prev) => prev.filter((item) => item.id !== rule.id));
    } catch (err: any) {
      setError(err.message || (lang === "en" ? "Failed to delete fee rule" : "删除费用规则失败"));
    } finally {
      setDeletingId("");
    }
  }

  async function saveRules() {
    if (!canRunAction()) return;
    const payload = rules
      .map((rule, index) => ({
        id: rule.id || undefined,
        name: String(rule.name || "").trim(),
        charge_type: rule.charge_type,
        mode: rule.mode,
        value: Number(rule.value),
        is_active: rule.is_active === true,
        sort_order: Number.isFinite(Number(rule.sort_order)) ? Number(rule.sort_order) : (index + 1) * 10
      }))
      .filter((rule) => rule.name && Number.isInteger(rule.value) && rule.value > 0);

    if (payload.length === 0) {
      setError(lang === "en" ? "Add at least one valid fee rule" : "请至少填写一条有效费用规则");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const body = await apiFetchJson<{ rules: FeeRule[] }>("/api/pricing/rules", {
        method: "PATCH",
        body: { rules: payload },
        timeoutMs: 9000,
        retries: 0
      });
      setRules(body.rules || []);
      await loadRules();
    } catch (err: any) {
      setError(err.message || (lang === "en" ? "Failed to save fees" : "保存费用失败"));
    } finally {
      setSaving(false);
    }
  }

  function chargeTypeLabel(value: ChargeType) {
    if (value === "discount") return lang === "en" ? "Discount" : "折扣";
    if (value === "service_fee") return lang === "en" ? "Service Fee" : "服务费";
    return lang === "en" ? "Tax" : "税费";
  }

  return (
    <div className="stack manage-subpage-screen">
      <div className="manage-subpage-scroll stack">
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={() => { void loadRules(); }}>
            {t("common.refresh", "刷新")}
          </Button>
        </div>
        <div className="panel stack manage-panel">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3 style={{ margin: 0 }}>{t("fees.section", "费用设置")}</h3>
            <button
              type="button"
              className="secondary compact-btn"
              onClick={() => setSectionOpen((v) => !v)}
            >
              {sectionOpen ? t("common.collapse", "收起") : t("common.expand", "展开")}
            </button>
          </div>
          {sectionOpen ? (
            <div className="muted">
              {t("fees.hint", "开启后会自动应用到所有未结账订单；关闭后会从未结账订单移除该自动费用。")}
            </div>
          ) : null}
        </div>

        {sectionOpen ? (
          <div className="panel stack manage-panel">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>{t("fees.activeCount", "已启用规则")}：{activeCount}</strong>
              <button className="secondary compact-btn" type="button" onClick={addRule}>
                {t("fees.addRule", "新增费用")}
              </button>
            </div>

            {loading ? <div className="muted">{t("common.loading", "加载中...")}</div> : null}
            {error ? <div className="muted">{error}</div> : null}

            {!loading && rules.length === 0 ? (
              <div className="muted">{t("fees.empty", "暂无规则，点击“新增费用”创建")}</div>
            ) : null}

            {rules.map((rule, index) => (
              <div key={`fee-${rule.id || index}`} className="row fee-rule-row">
                <input
                  value={rule.name}
                  onChange={(e) => updateRule(index, { name: e.target.value })}
                  placeholder={t("fees.name", "规则名称")}
                />
                <select
                  value={rule.charge_type}
                  onChange={(e) => updateRule(index, { charge_type: e.target.value as ChargeType })}
                >
                  <option value="service_fee">{chargeTypeLabel("service_fee")}</option>
                  <option value="discount">{chargeTypeLabel("discount")}</option>
                  <option value="tax">{chargeTypeLabel("tax")}</option>
                </select>
                <select
                  value={rule.mode}
                  onChange={(e) => updateRule(index, { mode: e.target.value as ChargeMode })}
                >
                  <option value="percent">{t("fees.percent", "百分比 %")}</option>
                  <option value="amount">{t("fees.amount", "固定金额 ₱")}</option>
                </select>
                <input
                  value={rule.value}
                  inputMode="numeric"
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^\d]/g, "");
                    updateRule(index, { value: raw ? Number(raw) : 0 });
                  }}
                  placeholder={rule.mode === "percent" ? "10" : "50"}
                />
                <button
                  type="button"
                  className={rule.is_active ? "ios-switch on" : "ios-switch"}
                  onClick={() => updateRule(index, { is_active: !rule.is_active })}
                  aria-pressed={rule.is_active}
                  aria-label={`${rule.name || t("fees.name", "规则")} ${rule.is_active ? "enabled" : "disabled"}`}
                />
                <button
                  type="button"
                  className="secondary compact-btn"
                  onClick={() => { void deleteRule(index); }}
                  disabled={saving || (Boolean(rule.id) && deletingId === rule.id)}
                >
                  {deletingId === rule.id ? t("orders.deleting", "删除中...") : t("fees.delete", "删除")}
                </button>
              </div>
            ))}

            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button type="button" onClick={saveRules} disabled={saving || loading}>
                {saving ? t("admin.saving", "保存中...") : t("common.save", "保存")}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <BottomNav />
    </div>
  );
}
