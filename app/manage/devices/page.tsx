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

export default function ManageDevicesPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const { token, role } = getStoredAuth();
      if (!token || role !== "manager") {
        router.replace("/");
        return;
      }
      const body = await apiFetchJson<Payload>("/api/devices", { timeoutMs: 6000, retries: 1 });
      setData(body);
    } catch (err: any) {
      setError(err.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function markStatus(deviceCode: string, status: "online" | "offline" | "degraded") {
    setUpdating(deviceCode);
    setError("");
    try {
      await apiFetchJson("/api/devices", {
        method: "PATCH",
        body: { deviceCode, status },
        timeoutMs: 6000,
        retries: 0
      });
      await loadData();
    } catch (err: any) {
      setError(err.message || "状态更新失败");
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
      <header>
        <h1>{t("devices.title", "设备状态")}</h1>
        <div className="row">
          <button className="secondary compact-btn" type="button" onClick={() => { void loadData(); }}>
            {t("common.refresh", "刷新")}
          </button>
          <button className="compact-btn" type="button" onClick={() => { void retryPrintJobs(); }}>
            重试打印
          </button>
        </div>
      </header>

      <ManageTabs />

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
              <span className="tag">{device.status}</span>
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
                Online
              </button>
              <button
                type="button"
                className="secondary compact-btn"
                onClick={() => { void markStatus(device.device_code, "degraded"); }}
                disabled={updating === device.device_code}
              >
                Degraded
              </button>
              <button
                type="button"
                className="secondary compact-btn"
                onClick={() => { void markStatus(device.device_code, "offline"); }}
                disabled={updating === device.device_code}
              >
                Offline
              </button>
            </div>
          </div>
        ))}
      </div>

      <BottomNav />
    </div>
  );
}
