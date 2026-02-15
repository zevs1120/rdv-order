import "./globals.css";
import type { ReactNode } from "react";
import type { Viewport } from "next";
import I18nProvider from "./components/i18n-provider";
import LanguageSwitch from "./components/language-switch";

export const metadata = {
  title: "RDV 点餐",
  description: "酒店/餐厅手机点餐系统 MVP"
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f7f4ef"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <I18nProvider>
          <LanguageSwitch />
          <main>
            {children}
          </main>
        </I18nProvider>
      </body>
    </html>
  );
}
