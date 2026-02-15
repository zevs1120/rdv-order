"use client";

import { useI18n } from "./i18n-provider";

export default function LanguageSwitch() {
  const { lang, setLang, t } = useI18n();
  return (
    <button
      type="button"
      className="lang-switch"
      onClick={() => setLang(lang === "zh" ? "en" : "zh")}
      aria-label="switch language"
    >
      {t("lang.toggle", lang === "zh" ? "EN" : "中")}
    </button>
  );
}

