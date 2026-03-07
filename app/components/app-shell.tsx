"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import TopBar from "./top-bar";
import BottomNav from "./bottom-nav";

type Props = {
  children: ReactNode;
};

const HIDE_TOP_BAR_PATHS = new Set<string>([]);
const HIDE_TAB_BAR_PREFIXES = ["/"];

function shouldHideTabBar(pathname: string) {
  return HIDE_TAB_BAR_PREFIXES.includes(pathname);
}

export default function AppShell({ children }: Props) {
  const pathname = usePathname();
  const hideTopBar = HIDE_TOP_BAR_PATHS.has(pathname);
  const hideTabBar = shouldHideTabBar(pathname);
  const lockRootScroll = pathname.startsWith("/order");

  return (
    <div className="app-shell">
      {!hideTopBar ? <TopBar /> : null}
      <div
        className={[
          hideTabBar ? "app-shell-main no-tabbar" : "app-shell-main has-tabbar",
          lockRootScroll ? "app-shell-main--locked" : ""
        ].filter(Boolean).join(" ")}
      >
        <main className="app-main">{children}</main>
      </div>
      {!hideTabBar ? <BottomNav global /> : null}
    </div>
  );
}
