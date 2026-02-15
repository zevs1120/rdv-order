"use client";

import { useState } from "react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, pin })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "登录失败");
      }
      const data = await res.json();
      localStorage.setItem("rdv_token", data.token);
      localStorage.setItem("rdv_role", data.role);
      if (data.role === "manager") {
        window.location.href = "/summary";
      } else {
        window.location.href = "/order";
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
        <h1>RDV 点餐系统</h1>
        <div className="muted">稳定 / 简单 / 低成本</div>
      </header>
      <div className="card">
        <form className="stack" onSubmit={onSubmit}>
          <label className="stack">
            账号
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="服务员账号" />
          </label>
          <label className="stack">
            PIN 码
            <input value={pin} onChange={(e) => setPin(e.target.value)} placeholder="4-6 位" type="password" />
          </label>
          {error && <div className="muted">{error}</div>}
          <button type="submit" disabled={loading}>{loading ? "登录中..." : "登录"}</button>
        </form>
      </div>
      <div className="muted">没有网络时请使用手写单</div>
    </div>
  );
}
