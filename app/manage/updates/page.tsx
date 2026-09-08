"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredAuth } from "../../../lib/client-api";
import { useI18n } from "../../components/i18n-provider";
import { Button, Card } from "../../../components/ui";
import packageInfo from "../../../package.json";

type Release = { version: string; versionCode: number; notes: { zh: string; en: string }; url: string };

export default function UpdatesPage() {
  const router = useRouter();
  const { lang } = useI18n();
  const [release, setRelease] = useState<Release | null>(null);
  const [checking, setChecking] = useState(true);
  const [failed, setFailed] = useState(false);
  const check = useCallback(async () => {
    setChecking(true);
    setFailed(false);
    try {
      const response = await fetch("/api/app-release", { cache: "no-store", signal: AbortSignal.timeout(7000) });
      if (!response.ok) throw new Error("Unavailable");
      setRelease(await response.json());
    } catch {
      setFailed(true);
      setRelease(null);
    } finally { setChecking(false); }
  }, []);
  useEffect(() => {
    const auth = getStoredAuth();
    if (!auth.token || !["manager", "waiter"].includes(auth.role)) { router.replace("/"); return; }
    void check();
  }, [check, router]);
  const text = (zh: string, en: string) => lang === "zh" ? zh : en;
  return (
    <div className="stack">
      <Card className="stack">
        <h3>{text("网页端", "Web")}</h3>
        <div>{text("当前版本", "Current version")} · v{packageInfo.version}</div>
        <div className="muted">{text("网页随发布更新，重新打开即可加载。", "Reopen the website to load published changes.")}</div>
      </Card>
      <Card className="stack">
        <h3>{text("Android APP", "Android app")}</h3>
        <div role="status">{checking ? text("正在检查更新…", "Checking for updates…") : failed
          ? text("暂时无法获取版本，请重试。", "Unable to check the version. Please retry.")
          : text("已获取最新发布版本", "Latest published release retrieved")}</div>
        {release && <>
          <div>{text("最新版本", "Latest version")} · v{release.version} ({release.versionCode})</div>
          <p style={{ margin: 0 }}>{release.notes[lang]}</p>
          <a href={release.url}>{text("下载最新 APP", "Download latest app")}</a>
        </>}
        <div className="muted">{text("已安装版本及是否需要更新，请在 APP 的更新管理中查看。", "See Updates in the app for its installed version and update status.")}</div>
        <Button onClick={() => void check()} disabled={checking}>{text("检查更新", "Check for updates")}</Button>
      </Card>
    </div>
  );
}
