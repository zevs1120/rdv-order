"use client";

import type { PresetKey } from "../../lib/date-range";
import { useI18n } from "./i18n-provider";

const PRESETS: Array<{ key: PresetKey; labelKey: string; zh: string; en: string }> = [
  { key: "today", labelKey: "income.today", zh: "当天", en: "Today" },
  { key: "yesterday", labelKey: "income.yesterday", zh: "昨天", en: "Yest." },
  { key: "week", labelKey: "income.week", zh: "近1周", en: "1 wk" },
  { key: "month", labelKey: "income.month", zh: "近1月", en: "1 mo" },
  { key: "3months", labelKey: "income.threeMonths", zh: "近3月", en: "3 mo" },
  { key: "year", labelKey: "income.year", zh: "近1年", en: "1 yr" }
];

export default function DatePresets({ value, onChange }: { value: PresetKey; onChange: (value: PresetKey) => void }) {
  const { lang, t } = useI18n();
  return <div className="report-date-presets" role="group" aria-label={lang === "en" ? "Date range" : "时间范围"}>
    {PRESETS.map(({ key, labelKey, zh, en }) => <button key={key} type="button"
      className={`manage-preset${value === key ? " is-active" : ""}`} aria-pressed={value === key}
      aria-label={t(labelKey, lang === "en" ? en : zh)} title={t(labelKey, lang === "en" ? en : zh)} onClick={() => onChange(key)}>
      {lang === "en" ? en : zh}
    </button>)}
  </div>;
}
