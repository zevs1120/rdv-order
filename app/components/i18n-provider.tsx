"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { type Lang, translate } from "../../lib/i18n";

type I18nContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string, fallback?: string) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export default function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    if (typeof window === "undefined") return "en";
    const stored = localStorage.getItem("rdv_lang");
    if (stored === "zh" || stored === "en") return stored;
    const browserLang = (navigator.language || "").toLowerCase();
    return browserLang.startsWith("zh") ? "zh" : "en";
  });

  useEffect(() => {
    // client-only sync guard for environments where localStorage might change between mounts
    const stored = localStorage.getItem("rdv_lang");
    if (stored === "zh" || stored === "en") {
      setLang((prev) => (prev === stored ? prev : stored));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("rdv_lang", lang);
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  }, [lang]);

  const value = useMemo<I18nContextValue>(() => ({
    lang,
    setLang,
    t: (key: string, fallback?: string) => translate(lang, key, fallback)
  }), [lang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return ctx;
}
