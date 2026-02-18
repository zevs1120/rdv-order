import "./globals.css";
import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import I18nProvider from "./components/i18n-provider";
import LanguageSwitch from "./components/language-switch";
import PwaRegister from "./components/pwa-register";
import NetworkStatusBar from "./components/network-status-bar";

export const metadata: Metadata = {
  title: "RDV 点餐",
  description: "酒店/餐厅手机点餐系统 MVP",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "RDV 点餐",
    statusBarStyle: "default"
  },
  icons: {
    icon: "/icons/icon.svg",
    apple: "/icons/icon.svg"
  }
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
          <PwaRegister />
          <NetworkStatusBar />
          <LanguageSwitch />
          <main>
            {children}
          </main>
        </I18nProvider>
      </body>
    </html>
  );
}
