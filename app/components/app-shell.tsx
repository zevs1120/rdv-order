"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import TopBar from "./top-bar";
import BottomNav from "./bottom-nav";
import { setupPerfDebugObserver } from "../../lib/perf-debug";
import { dispatchTopbarAction, resolveRefreshAction } from "../../lib/topbar-events";

type Props = {
  children: ReactNode;
};

const HIDE_TOP_BAR_PATHS = new Set<string>(["/"]);
const HIDE_TAB_BAR_PREFIXES = ["/"];

function shouldHideTabBar(pathname: string) {
  return HIDE_TAB_BAR_PREFIXES.includes(pathname);
}

export default function AppShell({ children }: Props) {
  const pathname = usePathname();
  const mainRef = useRef<HTMLDivElement | null>(null);
  const pullStartYRef = useRef<number | null>(null);
  const pullDistanceRef = useRef(0);
  const pullTriggeredRef = useRef(false);
  const hideTopBar = HIDE_TOP_BAR_PATHS.has(pathname);
  const hideTabBar = shouldHideTabBar(pathname);
  const lockRootScroll = pathname.startsWith("/order");
  const refreshAction = useMemo(() => resolveRefreshAction(pathname), [pathname]);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    const platform = ua.includes("android")
      ? "android"
      : (/iphone|ipad|ipod/.test(ua) ? "ios" : "other");
    document.documentElement.dataset.platform = platform;
  }, []);

  useEffect(() => {
    return setupPerfDebugObserver();
  }, []);

  useEffect(() => {
    setPullDistance(0);
    setIsPullRefreshing(false);
    pullStartYRef.current = null;
    pullDistanceRef.current = 0;
    pullTriggeredRef.current = false;
  }, [pathname]);

  useEffect(() => {
    const node = mainRef.current;
    if (!node || !refreshAction || lockRootScroll) return;
    const mainNode = node;
    const currentRefreshAction = refreshAction;

    const PULL_TRIGGER_PX = 64;
    const PULL_MAX_PX = 88;
    let finishTimer: number | null = null;

    function resetPull() {
      pullStartYRef.current = null;
      pullDistanceRef.current = 0;
      pullTriggeredRef.current = false;
      setPullDistance(0);
    }

    function finishRefresh() {
      if (finishTimer) window.clearTimeout(finishTimer);
      finishTimer = window.setTimeout(() => {
        setIsPullRefreshing(false);
        resetPull();
      }, 900);
    }

    function onTouchStart(event: TouchEvent) {
      if (mainNode.scrollTop > 0 || isPullRefreshing) return;
      pullStartYRef.current = event.touches[0]?.clientY ?? null;
      pullDistanceRef.current = 0;
      pullTriggeredRef.current = false;
    }

    function onTouchMove(event: TouchEvent) {
      if (pullStartYRef.current === null || isPullRefreshing) return;
      if (mainNode.scrollTop > 0) {
        resetPull();
        return;
      }
      const currentY = event.touches[0]?.clientY ?? pullStartYRef.current;
      const delta = currentY - pullStartYRef.current;
      if (delta <= 0) {
        resetPull();
        return;
      }
      const damped = Math.min(PULL_MAX_PX, delta * 0.42);
      pullDistanceRef.current = damped;
      setPullDistance(damped);
      event.preventDefault();
    }

    function onTouchEnd() {
      if (isPullRefreshing) return;
      const shouldRefresh = pullDistanceRef.current >= PULL_TRIGGER_PX;
      if (!shouldRefresh) {
        resetPull();
        return;
      }
      if (pullTriggeredRef.current) return;
      pullTriggeredRef.current = true;
      setIsPullRefreshing(true);
      setPullDistance(48);
      dispatchTopbarAction({ action: currentRefreshAction });
      finishRefresh();
    }

    mainNode.addEventListener("touchstart", onTouchStart, { passive: true });
    mainNode.addEventListener("touchmove", onTouchMove, { passive: false });
    mainNode.addEventListener("touchend", onTouchEnd, { passive: true });
    mainNode.addEventListener("touchcancel", resetPull, { passive: true });

    return () => {
      if (finishTimer) window.clearTimeout(finishTimer);
      mainNode.removeEventListener("touchstart", onTouchStart);
      mainNode.removeEventListener("touchmove", onTouchMove);
      mainNode.removeEventListener("touchend", onTouchEnd);
      mainNode.removeEventListener("touchcancel", resetPull);
    };
  }, [isPullRefreshing, lockRootScroll, refreshAction]);

  return (
    <div className="app-shell">
      {!hideTopBar ? (
        <Suspense fallback={null}>
          <TopBar />
        </Suspense>
      ) : null}
      <div
        ref={mainRef}
        className={[
          hideTabBar ? "app-shell-main no-tabbar" : "app-shell-main has-tabbar",
          lockRootScroll ? "app-shell-main--locked" : ""
        ].filter(Boolean).join(" ")}
      >
        {refreshAction ? (
          <div
            className={`app-shell-pull-indicator ${isPullRefreshing ? "is-refreshing" : ""} ${pullDistance >= 64 ? "is-ready" : ""}`}
            style={{ transform: `translate(-50%, ${Math.max(-52, pullDistance - 52)}px)` }}
            aria-hidden="true"
          >
            <span className="app-shell-pull-indicator__spinner" />
          </div>
        ) : null}
        <main className="app-main">{children}</main>
      </div>
      {!hideTabBar ? <BottomNav global /> : null}
    </div>
  );
}
