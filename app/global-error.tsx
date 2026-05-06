"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[rdv-global-error]", error);
  }, [error]);

  return (
    <html lang="zh-CN">
      <body>
        <main className="app-page">
          <div className="card login-card">
            <div className="stack">
              <h1>系统暂时不可用</h1>
              <p className="muted">请重试；如果网络较慢，系统会尽量继续使用已保存的数据。</p>
              <div className="row">
                <button type="button" onClick={reset}>重试</button>
                <button type="button" onClick={() => window.location.assign("/")}>回到登录</button>
              </div>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
