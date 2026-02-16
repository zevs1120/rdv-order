"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import BottomNav from "../../components/bottom-nav";
import ManageTabs from "../../components/manage-tabs";
import { apiFetchJson, getStoredAuth } from "../../../lib/client-api";
import { useI18n } from "../../components/i18n-provider";

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
};

type PrintHealth = {
  provider: {
    primary: "cloud" | "agent";
    fallback: "cloud" | "agent" | null;
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
  ready: boolean;
  warnings: string[];
};

export default function ManageDevicesPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState("");
  const [health, setHealth] = useState<PrintHealth | null>(null);
  const [healthOpen, setHealthOpen] = useState(true);

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
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  return (
    <div className="stack">
      <header className="devices-header">
        <h1>{t("devices.title", "设备状态")}</h1>
        <div className="row devices-actions">
          <button className="secondary compact-btn" type="button" onClick={() => { void loadData(); }}>
            {t("common.refresh", "刷新")}
          </button>
          <button className="compact-btn" type="button" onClick={() => { void retryPrintJobs(); }}>
            {t("devices.retryPrint", "重试打印")}
          </button>
        </div>
      </header>

      <ManageTabs />

      <div className="panel stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <strong>{t("devices.deployReadiness", "打印部署就绪")}</strong>
          <button
            type="button"
            className="secondary compact-btn"
            onClick={() => setHealthOpen((v) => !v)}
          >
            {healthOpen ? t("common.collapse", "收起") : t("common.expand", "展开")}
          </button>
        </div>
        {healthOpen ? (
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
            {health?.warnings?.length ? (
              <div className="stack" style={{ gap: 4 }}>
                <span className="muted">{t("devices.warnings", "告警")}:</span>
                {health.warnings.map((warning) => (
                  <span key={warning} className="muted">- {warning}</span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="panel stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <strong>{t("devices.pendingJobs", "待打印")}：{data?.printQueue.pending || 0}</strong>
          <strong>{t("devices.failedJobs", "打印失败")}：{data?.printQueue.failed || 0}</strong>
        </div>
      </div>

      {loading ? <div className="muted">{t("common.loading", "加载中...")}</div> : null}
      {error ? <div className="muted">{error}</div> : null}

      <div className="order-list">
        {(data?.devices || []).map((device) => (
          <div key={device.id} className="panel stack">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>{device.label}</strong>
              <span className="tag">
                {device.status === "online"
                  ? t("devices.online", "在线")
                  : device.status === "degraded"
                    ? t("devices.degraded", "降级")
                    : t("devices.offline", "离线")}
              </span>
            </div>
            <div className="muted">{device.device_code} · {device.device_type}{device.is_backup ? " · backup" : ""}</div>
            <div className="muted">fail={device.fail_count} · lastSeen={device.last_seen_at ? new Date(device.last_seen_at).toLocaleString() : "-"}</div>
            {device.last_error ? <div className="muted">{device.last_error}</div> : null}
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
          </div>
        ))}
      </div>

      <BottomNav />
    </div>
  );
}
