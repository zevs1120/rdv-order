"use client";

import { useConnectionRefresh } from "../../../lib/use-connection-refresh";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetchJson, getStoredAuth } from "../../../lib/client-api";
import { useI18n } from "../../components/i18n-provider";
import { Button } from "../../../components/ui";
import { RDV_TOPBAR_ACTION_EVENT, type TopbarActionDetail } from "../../../lib/topbar-events";

type Device = {
  id: string;
  device_code: string;
  device_type: string;
  label: string;
  status: "online" | "offline" | "degraded";
  is_backup: boolean;
  fail_count: number;
  last_seen_at: string | null;
  last_error: string | null;
};

type Payload = {
  devices: Device[];
  printQueue: {
    pending: number;
    failed: number;
  };
  alerts: Array<{
    level: "warning" | "critical";
    code: string;
    message: string;
  }>;
};

type PrintHealth = {
  provider: {
    primary: "cloud" | "agent" | "xpyun";
    fallback: "cloud" | "agent" | "xpyun" | null;
  };
  config: {
    primary: { url: string; tokenSet: boolean; ready: boolean };
    fallback: { url: string; tokenSet: boolean; ready: boolean } | null;
    workerKeySet: boolean;
    heartbeatKeySet: boolean;
  };
  queue: {
    pending: number;
    failed: number;
  };
  routes: {
    barCategories: string[];
    barKeywords: string[];
  };
  ready: boolean;
  warnings: string[];
};

export default function ManageDevicesPage() {
  const router = useRouter();
  const { t, lang } = useI18n();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [testing, setTesting] = useState("");
  const [clearingQueue, setClearingQueue] = useState(false);
  const [health, setHealth] = useState<PrintHealth | null>(null);

  useConnectionRefresh(loadData, !loading && !updating && !testing && !clearingQueue && !retrying);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const { token, role } = getStoredAuth();
      if (!token || role !== "manager") {
        router.replace("/");
        return;
      }
      const [body, healthBody] = await Promise.all([
        apiFetchJson<Payload>("/api/devices", { timeoutMs: 6000, retries: 1 }),
        apiFetchJson<PrintHealth>("/api/print/health", { timeoutMs: 6000, retries: 1 })
      ]);
      setData(body);
      setHealth(healthBody);
    } catch (err: any) {
      setError(err.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function markStatus(deviceCode: string, status: "online" | "offline" | "degraded") {
    if (!data) return;
    setUpdating(deviceCode);
    setError("");
    try {
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          devices: prev.devices.map((item) =>
            item.device_code === deviceCode ? { ...item, status } : item
          )
        };
      });
      await apiFetchJson("/api/devices", {
        method: "PATCH",
        body: { deviceCode, status },
        timeoutMs: 6000,
        retries: 0
      });
      const healthBody = await apiFetchJson<PrintHealth>("/api/print/health", { timeoutMs: 6000, retries: 1 });
      setHealth(healthBody);
    } catch (err: any) {
      setError(err.message || "状态更新失败");
      await loadData();
    } finally {
      setUpdating("");
    }
  }

  async function retryPrintJobs() {
    if (retrying) return;
    setRetrying(true);
    setError("");
    try {
      await apiFetchJson("/api/print/dispatch", {
        method: "POST",
        body: { limit: 10 },
        timeoutMs: 8000,
        retries: 0
      });
      await loadData();
    } catch (err: any) {
      setError(err.message || "重试失败");
    } finally {
      setRetrying(false);
    }
  }

  async function runSelfTest(target: "kitchen" | "bar" | "both") {
    setTesting(target);
    setError("");
    try {
      await apiFetchJson("/api/print/self-test", {
        method: "POST",
        body: { target },
        timeoutMs: 8000,
        retries: 0
      });
      await loadData();
    } catch (err: any) {
      setError(err.message || "打印自检失败");
    } finally {
      setTesting("");
    }
  }

  async function clearPrintQueue() {
    const confirmed = window.confirm(
      t("devices.clearQueueConfirm", "确认清空当前所有待打印、打印中和打印失败的队列任务吗？")
    );
    if (!confirmed) return;

    setClearingQueue(true);
    setError("");
    try {
      await apiFetchJson("/api/print/queue", {
        method: "DELETE",
        timeoutMs: 8000,
        retries: 0
      });
      await loadData();
    } catch (err: any) {
      setError(err.message || "清空打印队列失败");
    } finally {
      setClearingQueue(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    function onTopbarAction(event: Event) {
      const custom = event as CustomEvent<TopbarActionDetail>;
      if (custom.detail?.action === "devices-refresh") {
        void loadData();
      }
    }
    window.addEventListener(RDV_TOPBAR_ACTION_EVENT, onTopbarAction as EventListener);
    return () => window.removeEventListener(RDV_TOPBAR_ACTION_EVENT, onTopbarAction as EventListener);
  }, []);

  function deviceLabel(device: Device) {
    const label = device.label;
    const known: Record<string, [string, string]> = {
      "Primary Printer": ["主打印机", "Primary printer"], "Backup Printer": ["备用打印机", "Backup printer"],
      "后厨主打印机": ["后厨打印机", "Kitchen printer"], "吧台主打印机": ["吧台打印机", "Bar printer"],
      "后厨打印机": ["后厨打印机", "Kitchen printer"], "吧台打印机": ["吧台打印机", "Bar printer"]
    };
    return known[label]?.[lang === "en" ? 1 : 0] || label;
  }

  return (
    <div className="stack manage-subpage-screen">
      <div className="manage-subpage-scroll stack">
        {loading ? null : <div className="panel stack">
          <strong>{lang === "en" ? "Print queue" : "打印队列"}</strong>
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
            <span>{t("devices.pendingJobs", "待打印")}：{data?.printQueue.pending ?? "—"}</span>
            <span>{t("devices.failedJobs", "打印失败")}：{data?.printQueue.failed ?? "—"}</span>
          </div>
          <Button disabled={retrying || !data} onClick={() => { void retryPrintJobs(); }}>{retrying ? t("common.loading", "加载中...") : (lang === "en" ? "Retry queued jobs" : "重试队列任务")}</Button>
        </div>}
        <div className="panel stack">
          <strong>{lang === "en" ? "Print test page" : "打印测试单"}</strong>
          <div className="row" style={{ flexWrap: "wrap" }}>
            {(["kitchen", "bar", "both"] as const).map((target) => <button key={target} className="secondary compact-btn" type="button"
              onClick={() => { void runSelfTest(target); }} disabled={testing !== "" || clearingQueue}>
              {testing === target ? t("common.loading", "加载中...") : target === "kitchen" ? (lang === "en" ? "Kitchen" : "后厨") : target === "bar" ? (lang === "en" ? "Bar" : "吧台") : (lang === "en" ? "Both printers" : "两台打印机")}
            </button>)}
          </div>
        </div>

        {loading ? <div className="muted">{t("common.loading", "加载中...")}</div> : null}
        {error ? <div className="muted">{error}</div> : null}
        {(data?.alerts || []).length > 0 ? (
          <div className="panel stack device-alert-panel">
            <strong>{t("devices.alertTitle", "打印告警")}</strong>
            {(data?.alerts || []).map((alert) => (
              <div key={`${alert.code}-${alert.message}`} className="muted">
                - {lang === "en" && alert.code === "print_queue_failed_high"
                  ? `${data?.printQueue.failed || 0} failed print jobs. Check the printers.`
                  : lang === "en" && alert.code === "device_fail_count_high"
                    ? (() => {
                      const device = data?.devices.find((item) => alert.message.startsWith(item.device_code + " "));
                      return device ? `${deviceLabel(device)}: ${device.fail_count} consecutive failures` : "Printer failures recorded";
                    })()
                    : alert.message}
              </div>
            ))}
            <div className="muted">{t("devices.alertHint", "建议优先检查主打印机网络，必要时切换备用通道。")}</div>
          </div>
        ) : null}

        <div className="order-list">
          {(data?.devices || []).map((device) => (
            <div key={device.id} className="panel stack">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <strong>{deviceLabel(device)}</strong>
                <span className="tag">
                  {!device.last_seen_at ? (lang === "en" ? "Unknown" : "未知") : device.status === "online"
                    ? t("devices.online", "在线")
                    : device.status === "degraded"
                      ? t("devices.degraded", "降级")
                      : t("devices.offline", "离线")}
                </span>
              </div>
              <div className="muted">{lang === "en" ? "Recorded status · Last seen" : "记录状态 · 最近联系"}：{device.last_seen_at ? new Date(device.last_seen_at).toLocaleString() : (lang === "en" ? "Unknown" : "未知")}</div>

            </div>
          ))}
        </div>
        <details className="panel stack">
          <summary>{lang === "en" ? "Advanced diagnostics" : "高级诊断"}</summary>
        <div className="stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong>{t("devices.deployReadiness", "打印部署就绪")}</strong>

          </div>
            <div className="order-list">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span>{t("devices.overall", "整体状态")}</span>
                <span className="tag">{health?.ready ? t("devices.ready", "就绪") : t("devices.notReady", "未就绪")}</span>
              </div>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span>Primary: {health?.provider.primary || "-"}</span>
                <span className="tag">{health?.config.primary.ready ? t("devices.ready", "就绪") : t("devices.notReady", "未就绪")}</span>
              </div>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span>Fallback: {health?.provider.fallback || "-"}</span>
                <span className="tag">
                  {health?.provider.fallback
                    ? (health?.config.fallback?.ready ? t("devices.ready", "就绪") : t("devices.notReady", "未就绪"))
                    : t("devices.notSet", "未配置")}
                </span>
              </div>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span>PRINT_WORKER_KEY</span>
                <span className="tag">{health?.config.workerKeySet ? t("devices.ready", "就绪") : t("devices.notSet", "未配置")}</span>
              </div>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span>DEVICE_HEARTBEAT_KEY</span>
                <span className="tag">{health?.config.heartbeatKeySet ? t("devices.ready", "就绪") : t("devices.notSet", "未配置")}</span>
              </div>
              <div className="muted">
                {t("devices.routeBarCategories", "吧台分类路由")}: {(health?.routes.barCategories || []).join(", ") || "-"}
              </div>
              <div className="muted">
                {t("devices.routeBarKeywords", "吧台关键词路由")}: {(health?.routes.barKeywords || []).join(", ") || "-"}
              </div>
              {health?.warnings?.length ? (
                <div className="stack" style={{ gap: 4 }}>
                  <span className="muted">{t("devices.warnings", "告警")}:</span>
                  {health.warnings.map((warning) => (
                    <span key={warning} className="muted">- {warning}</span>
                  ))}
                </div>
              ) : null}
            </div>
        </div>

          <div className="stack">
            {(data?.devices || []).map((device) => <div key={device.id} className="stack">
              <strong>{deviceLabel(device)}</strong>
              <div className="muted">{device.device_code} · {device.device_type}{device.is_backup ? (lang === "en" ? " · backup" : " · 备用") : ""}</div>
              <div className="muted">{lang === "en" ? "Consecutive failures" : "连续失败"}：{device.fail_count}</div>
              {device.last_error && <div className="muted">{device.last_error}</div>}
              <div className="row" style={{ flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="secondary compact-btn"
                  onClick={() => { void markStatus(device.device_code, "online"); }}
                  disabled={updating === device.device_code}
                >
                  {t("devices.markOnline", "设为在线")}
                </button>
                <button
                  type="button"
                  className="secondary compact-btn"
                  onClick={() => { void markStatus(device.device_code, "degraded"); }}
                  disabled={updating === device.device_code}
                >
                  {t("devices.markDegraded", "设为降级")}
                </button>
                <button
                  type="button"
                  className="secondary compact-btn"
                  onClick={() => { void markStatus(device.device_code, "offline"); }}
                  disabled={updating === device.device_code}
                >
                  {t("devices.markOffline", "设为离线")}
                </button>
              </div>
            </div>)}
            <button className="secondary compact-btn" type="button" onClick={() => { void clearPrintQueue(); }} disabled={testing !== "" || clearingQueue}>
              {clearingQueue ? t("common.loading", "加载中...") : t("devices.clearQueue", "清空打印队列")}
            </button>
          </div>
        </details>

      </div>

    </div>
  );
}
