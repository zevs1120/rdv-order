"use client";

import { Suspense, useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import TopBar from "./top-bar";
import SettingsFab from "./settings-fab";

type Props = {
  children: ReactNode;
};

const HIDE_TOP_BAR_PATHS = new Set<string>(["/"]);

export default function AppShell({ children }: Props) {
  const pathname = usePathname();
  const hideTopBar = HIDE_TOP_BAR_PATHS.has(pathname);
  const showSettingsButton = pathname === "/tables" || pathname.startsWith("/order");
  const lockRootScroll = pathname.startsWith("/order");
  const isSettings = pathname.startsWith("/manage") || pathname.startsWith("/admin") || pathname === "/summary";

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    const platform = ua.includes("android")
      ? "android"
      : (/iphone|ipad|ipod/.test(ua) ? "ios" : "other");
    document.documentElement.dataset.platform = platform;
  }, []);

  return (
    <div className={isSettings ? "app-shell app-shell--settings" : lockRootScroll ? "app-shell app-shell--ordering" : "app-shell"}>
      {!hideTopBar ? (
        <Suspense fallback={null}>
          <TopBar />
        </Suspense>
      ) : null}
      <div
        className={[
          "app-shell-main no-tabbar",
          lockRootScroll ? "app-shell-main--locked" : ""
        ].filter(Boolean).join(" ")}
      >
        <main className="app-main">{children}</main>
      </div>
      {showSettingsButton ? <SettingsFab /> : null}
    </div>
  );
}
