"use client";

import { useState } from "react";
import { BottomSheet } from "./bottom-sheet";

/** Mount with an order-item key so each return starts with a fresh quantity. */
export function ReturnDishSheet({ name, maxQty, lang, busy, error, onClose, onConfirm }: {
  name: string;
  maxQty: number;
  lang: "zh" | "en";
  busy: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: (qty: number) => void;
}) {
  const [value, setValue] = useState("1");
  const qty = Number(value);
  const valid = Number.isInteger(qty) && qty > 0 && qty <= maxQty;
  return (
    <BottomSheet open onClose={() => { if (!busy) onClose(); }} title={lang === "en" ? "Return dish" : "退菜"}
      footer={<div className="row">
        <button type="button" className="secondary" disabled={busy} onClick={onClose}>{lang === "en" ? "Cancel" : "取消"}</button>
        <button type="button" disabled={busy || !valid} onClick={() => onConfirm(qty)}>{busy ? (lang === "en" ? "Returning…" : "退菜中…") : (lang === "en" ? "Confirm return" : "确认退菜")}</button>
      </div>}>
      <div className="stack">
        <strong>{name}</strong>
        {error && <span className="muted" role="alert">{error}</span>}
        <label className="stack">
          <span>{lang === "en" ? `Return quantity (max ${maxQty})` : `退菜数量（最多 ${maxQty}）`}</span>
          <input type="number" inputMode="numeric" min={1} max={maxQty} step={1} value={value} onChange={(event) => setValue(event.target.value)} disabled={busy} />
        </label>
        {!valid && <span className="muted" role="status">{lang === "en" ? `Enter a whole quantity from 1 to ${maxQty}` : `请输入 1 至 ${maxQty} 的整数数量`}</span>}
      </div>
    </BottomSheet>
  );
}
