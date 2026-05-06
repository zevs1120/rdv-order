"use client";

import { useEffect } from "react";
import { Button, Card } from "../components/ui";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[rdv-app-error]", error);
  }, [error]);

  return (
    <main className="app-page">
      <Card className="login-card">
        <div className="stack">
          <h1>页面暂时不可用</h1>
          <p className="muted">请重试；如果网络较慢，系统会尽量继续使用已保存的数据。</p>
          <div className="row">
            <Button onClick={reset}>重试</Button>
            <Button variant="secondary" onClick={() => window.location.assign("/tables")}>
              返回桌台
            </Button>
          </div>
        </div>
      </Card>
    </main>
  );
}
