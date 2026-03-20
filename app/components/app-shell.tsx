"use client";

import { Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
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
  const pullFrameRef = useRef<number | null>(null);
  const pullFinishTimerRef = useRef<number | null>(null);
  const pullRefreshingRef = useRef(false);
  const hideTopBar = HIDE_TOP_BAR_PATHS.has(pathname);
  const hideTabBar = shouldHideTabBar(pathname);
  const lockRootScroll = pathname.startsWith("/order");
  const refreshAction = useMemo(() => resolveRefreshAction(pathname), [pathname]);

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
    pullStartYRef.current = null;
    pullDistanceRef.current = 0;
    pullTriggeredRef.current = false;
    pullRefreshingRef.current = false;
    if (pullFrameRef.current) {
      window.cancelAnimationFrame(pullFrameRef.current);
      pullFrameRef.current = null;
    }
    if (pullFinishTimerRef.current) {
      window.clearTimeout(pullFinishTimerRef.current);
      pullFinishTimerRef.current = null;
    }
    const mainNode = mainRef.current;
    if (mainNode) {
      mainNode.style.setProperty("--pull-distance", "0px");
      mainNode.style.setProperty("--pull-indicator-offset", "0px");
      mainNode.dataset.pullState = "idle";
    }
  }, [pathname]);

  useEffect(() => {
    const node = mainRef.current;
    if (!node || !refreshAction || lockRootScroll) return;
    const mainNode = node;
    const currentRefreshAction = refreshAction;

    const PULL_TRIGGER_PX = 64;
    const PULL_MAX_PX = 88;

    function renderPull(distance: number, state: "idle" | "pulling" | "ready" | "refreshing") {
      if (pullFrameRef.current) window.cancelAnimationFrame(pullFrameRef.current);
      pullFrameRef.current = window.requestAnimationFrame(() => {
        mainNode.style.setProperty("--pull-distance", `${distance}px`);
        mainNode.style.setProperty("--pull-indicator-offset", `${Math.max(0, distance * 0.56)}px`);
        mainNode.dataset.pullState = state;
        pullFrameRef.current = null;
      });
    }

    function resetPull() {
      pullStartYRef.current = null;
      pullDistanceRef.current = 0;
      pullTriggeredRef.current = false;
      renderPull(0, "idle");
    }

    function finishRefresh() {
      if (pullFinishTimerRef.current) window.clearTimeout(pullFinishTimerRef.current);
      pullFinishTimerRef.current = window.setTimeout(() => {
        pullRefreshingRef.current = false;
        resetPull();
        pullFinishTimerRef.current = null;
      }, 900);
    }

    function onTouchStart(event: TouchEvent) {
      if (mainNode.scrollTop > 0 || pullRefreshingRef.current) return;
      pullStartYRef.current = event.touches[0]?.clientY ?? null;
      pullDistanceRef.current = 0;
      pullTriggeredRef.current = false;
    }

    function onTouchMove(event: TouchEvent) {
      if (pullStartYRef.current === null || pullRefreshingRef.current) return;
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
      renderPull(damped, damped >= PULL_TRIGGER_PX ? "ready" : "pulling");
      event.preventDefault();
    }

    function onTouchEnd() {
      if (pullRefreshingRef.current) return;
      const shouldRefresh = pullDistanceRef.current >= PULL_TRIGGER_PX;
      if (!shouldRefresh) {
        resetPull();
        return;
      }
      if (pullTriggeredRef.current) return;
      pullTriggeredRef.current = true;
      pullRefreshingRef.current = true;
      renderPull(56, "refreshing");
      dispatchTopbarAction({ action: currentRefreshAction });
      finishRefresh();
    }

    mainNode.addEventListener("touchstart", onTouchStart, { passive: true });
    mainNode.addEventListener("touchmove", onTouchMove, { passive: false });
    mainNode.addEventListener("touchend", onTouchEnd, { passive: true });
    mainNode.addEventListener("touchcancel", resetPull, { passive: true });

    return () => {
      if (pullFrameRef.current) {
        window.cancelAnimationFrame(pullFrameRef.current);
        pullFrameRef.current = null;
      }
      if (pullFinishTimerRef.current) {
        window.clearTimeout(pullFinishTimerRef.current);
        pullFinishTimerRef.current = null;
      }
      mainNode.removeEventListener("touchstart", onTouchStart);
      mainNode.removeEventListener("touchmove", onTouchMove);
      mainNode.removeEventListener("touchend", onTouchEnd);
      mainNode.removeEventListener("touchcancel", resetPull);
    };
  }, [lockRootScroll, refreshAction]);

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
        data-pull-state="idle"
      >
        {refreshAction ? (
          <div
            className="app-shell-pull-indicator"
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
