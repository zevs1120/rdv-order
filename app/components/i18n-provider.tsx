"use client";

import { createContext, startTransition, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { safeStorageGet, safeStorageSet } from "../../lib/browser-storage";
import { translate } from "../../lib/i18n";

type Lang = "zh" | "en";

type I18nContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string, fallback?: string) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);
const subscribeHydration = () => () => {};
const clientHydrationSnapshot = () => true;
const serverHydrationSnapshot = () => false;

export default function I18nProvider({ children }: { children: ReactNode }) {
  // Match SSR on the first render; restore the local preference after hydration.
  const [lang, setLang] = useState<Lang>("en");
  const [languageReady, setLanguageReady] = useState(false);

  useEffect(() => {
    const stored = safeStorageGet("local", "rdv_lang");
    const browserLang = (navigator.language || "").toLowerCase();
    // Let Suspense children (including the toolbar) hydrate before changing their text.
    startTransition(() => {
      setLang(stored === "zh" || stored === "en" ? stored : browserLang.startsWith("zh") ? "zh" : "en");
      setLanguageReady(true);
    });
  }, []);

  useEffect(() => {
    if (!languageReady) return;
    safeStorageSet("local", "rdv_lang", lang);
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  }, [lang, languageReady]);

  const value = useMemo<I18nContextValue>(() => ({
    lang,
    setLang,
    t: (key: string, fallback?: string) => translate(lang, key, fallback)
  }), [lang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  // Each streamed/Suspense boundary must match its own SSR snapshot, even if
  // the provider already restored the language before that boundary hydrated.
  const hydrated = useSyncExternalStore(subscribeHydration, clientHydrationSnapshot, serverHydrationSnapshot);
  if (!ctx) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return hydrated ? ctx : {
    lang: "en" as const,
    setLang: ctx.setLang,
    t: (key: string, fallback?: string) => translate("en", key, fallback)
  };
}
