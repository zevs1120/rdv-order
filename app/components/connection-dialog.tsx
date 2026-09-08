"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useI18n } from "./i18n-provider";
import { Button } from "../../components/ui";
import { connectionSnapshot, serverConnectionSnapshot, subscribeConnection,
  retryConnection, startConnectionMonitoring } from "../../lib/connection";

export default function ConnectionDialog() {
  const { lang } = useI18n();
  const state = useSyncExternalStore(subscribeConnection, connectionSnapshot, serverConnectionSnapshot);
  const dialog = useRef<HTMLDialogElement>(null);
  const text = (zh: string, en: string) => lang === "zh" ? zh : en;
  useEffect(startConnectionMonitoring, []);
  useEffect(() => {
    const element = dialog.current;
    if (state.disconnected && element && !element.open) element.showModal();
    else if (!state.disconnected && element?.open) element.close();
  }, [state.disconnected]);
  return (
    <dialog ref={dialog} className="connection-dialog" aria-labelledby="connection-title"
      aria-describedby="connection-description" onCancel={(event) => event.preventDefault()}>
      <h2 id="connection-title">{text("暂时无法连接", "Unable to connect")}</h2>
      <p id="connection-description">{text(
        "正在自动尝试恢复连接。你也可以检查网络后点击重试。",
        "Trying to reconnect automatically. You can also check your network and retry.")}</p>
      <Button fullWidth loading={state.checking} onClick={() => { void retryConnection(); }}>
        {state.checking ? text("正在重连…", "Reconnecting…") : text("重试", "Retry")}
      </Button>
    </dialog>
  );
}
