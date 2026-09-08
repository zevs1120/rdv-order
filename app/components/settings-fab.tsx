"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { safeStorageGet, safeStorageSet } from "../../lib/browser-storage";
import { SvgIcon } from "../../components/ui/svg-icon";
import { useI18n } from "./i18n-provider";

const POSITION_KEY = "rdv-settings-position-v1";
const clamp = (value: number) => Math.min(1, Math.max(0, value));
type Position = { x: number; y: number };

export default function SettingsFab() {
  const { t, lang } = useI18n();
  const label = t("nav.settings", "设置");
  const area = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position>({ x: 1, y: 1 });
  const current = useRef(position);
  const ignoreClick = useRef(false);
  const gesture = useRef<{
    id: number; x: number; y: number; start: Position; width: number; height: number; dragged: boolean;
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(safeStorageGet("local", POSITION_KEY));
      if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) {
        current.current = { x: clamp(saved.x), y: clamp(saved.y) };
        setPosition(current.current);
      }
    } catch { /* An absent/invalid preference uses the bottom-right corner. */ }
  }, []);

  function move(next: Position, save = false) {
    current.current = { x: clamp(next.x), y: clamp(next.y) };
    setPosition(current.current);
    if (save) safeStorageSet("local", POSITION_KEY, JSON.stringify(current.current));
  }

  function finish(event: PointerEvent<HTMLAnchorElement>, cancelled = false) {
    const active = gesture.current;
    if (!active || event.pointerId !== active.id) return;
    gesture.current = null;
    ignoreClick.current = active.dragged || cancelled;
    setDragging(false);
    if (active.dragged) move(current.current, true);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <div ref={area} className="settings-fab-area">
      <Link href="/manage" prefetch={false} className={`settings-fab${dragging ? " is-dragging" : ""}`}
        aria-label={label} title={lang === "en" ? "Settings · drag to move; arrow keys also move" : "设置 · 可拖动，方向键也可移动"}
        aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Home"
        draggable={false}
        style={{ left: `calc(${position.x * 100}% - ${position.x * 60}px)`, top: `calc(${position.y * 100}% - ${position.y * 60}px)` }}
        onPointerDown={(event) => {
          if (!event.isPrimary || event.button !== 0 || !area.current) return;
          ignoreClick.current = false;
          gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, start: current.current,
            width: Math.max(0, area.current.clientWidth - 60), height: Math.max(0, area.current.clientHeight - 60), dragged: false };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const active = gesture.current;
          if (!active || event.pointerId !== active.id) return;
          const dx = event.clientX - active.x;
          const dy = event.clientY - active.y;
          if (!active.dragged && Math.hypot(dx, dy) < 6) return;
          active.dragged = true;
          setDragging(true);
          move({ x: active.width ? active.start.x + dx / active.width : 0,
            y: active.height ? active.start.y + dy / active.height : 0 });
        }}
        onPointerUp={(event) => finish(event)}
        onPointerCancel={(event) => finish(event, true)}
        onLostPointerCapture={(event) => finish(event, true)}
        onClick={(event) => {
          if (ignoreClick.current && event.detail !== 0) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        onKeyDown={(event) => {
          if (event.altKey || event.ctrlKey || event.metaKey || !area.current) return;
          const directions: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
          if (event.key === "Home") { event.preventDefault(); move({ x: 1, y: 1 }, true); return; }
          const delta = directions[event.key];
          if (!delta) return;
          event.preventDefault();
          move({ x: current.current.x + delta[0] * 24 / Math.max(1, area.current.clientWidth - 60),
            y: current.current.y + delta[1] * 24 / Math.max(1, area.current.clientHeight - 60) }, true);
        }}>
        <SvgIcon name="settings" />
      </Link>
    </div>
  );
}
