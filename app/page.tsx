"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetchJson, getStoredAuth } from "../lib/client-api";
import { useI18n } from "./components/i18n-provider";

export default function LoginPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    const { token, role } = getStoredAuth();
    if (token && role === "manager") {
      router.replace("/manage/orders");
      return;
    }
    if (token && role === "waiter") {
      router.replace("/tables");
      return;
    }
    setCheckingSession(false);
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await apiFetchJson<{ token: string; role: "waiter" | "manager" }>("/api/login", {
        method: "POST",
        body: { username, pin },
        useAuth: false,
        retries: 0
      });
      localStorage.setItem("rdv_token", data.token);
      localStorage.setItem("rdv_role", data.role);
      if (data.role === "manager") {
        router.replace("/manage/orders");
      } else {
        router.replace("/tables");
      }
    } catch (err: any) {
      setError(err.message || "登录失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="stack">
      <header>
        <h1>{t("login.title", "RDV 点餐系统")}</h1>
        <div className="muted">{t("login.subtitle", "稳定 / 简单 / 低成本")}</div>
      </header>
      <div className="card">
        {checkingSession ? (
          <div className="stack">
            <div className="skeleton skeleton-row" />
            <div className="skeleton skeleton-row" />
            <div className="skeleton skeleton-card" />
          </div>
        ) : (
        <form className="stack" onSubmit={onSubmit}>
          <label className="stack">
            {t("login.username", "账号")}
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t("login.placeholder.user", "服务员账号")}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="username"
              spellCheck={false}
              enterKeyHint="next"
            />
          </label>
          <label className="stack">
            {t("login.pin", "PIN 码")}
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder={t("login.placeholder.pin", "4-6 位")}
              type="password"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="current-password"
              spellCheck={false}
              enterKeyHint="go"
            />
          </label>
          {error && <div className="muted">{error}</div>}
          <button type="submit" disabled={loading}>
            {loading ? t("login.submitting", "登录中...") : t("login.submit", "登录")}
          </button>
        </form>
        )}
      </div>
      <div className="muted">{t("login.offlineNote", "没有网络时请使用手写单")}</div>
    </div>
  );
}
