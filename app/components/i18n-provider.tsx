"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { safeStorageGet, safeStorageSet } from "../../lib/browser-storage";

type Lang = "zh" | "en";
type TranslateFn = (lang: Lang, key: string, fallback?: string) => string;

type I18nContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string, fallback?: string) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export default function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    if (typeof window === "undefined") return "en";
    const stored = safeStorageGet("local", "rdv_lang");
    if (stored === "zh" || stored === "en") return stored;
    const browserLang = (navigator.language || "").toLowerCase();
    return browserLang.startsWith("zh") ? "zh" : "en";
  });

  useEffect(() => {
    // client-only sync guard for environments where localStorage might change between mounts
    const stored = safeStorageGet("local", "rdv_lang");
    if (stored === "zh" || stored === "en") {
      setLang((prev) => (prev === stored ? prev : stored));
    }
  }, []);

  useEffect(() => {
    safeStorageSet("local", "rdv_lang", lang);
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  }, [lang]);

  const [translateFn, setTranslateFn] = useState<TranslateFn>(() => {
    return (_lang: Lang, key: string, fallback?: string) => fallback || key;
  });

  useEffect(() => {
    let alive = true;
    import("../../lib/i18n")
      .then((mod) => {
        if (!alive) return;
        setTranslateFn(() => mod.translate);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const value = useMemo<I18nContextValue>(() => ({
    lang,
    setLang,
    t: (key: string, fallback?: string) => translateFn(lang, key, fallback)
  }), [lang, translateFn]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return ctx;
}
