import "./globals.css";
import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import I18nProvider from "./components/i18n-provider";
import PwaRegister from "./components/pwa-register";
import TopBar from "./components/top-bar";

export const metadata: Metadata = {
  title: "RDV Ordering",
  description: "Mobile ordering system for hotel and restaurant operations",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "RDV Ordering",
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
  maximumScale: 1,
  userScalable: false,
  interactiveWidget: "resizes-content",
  viewportFit: "cover",
  themeColor: "#f3ede1"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-US">
      <body>
        <I18nProvider>
          <PwaRegister />
          <TopBar />
          <main>
            {children}
          </main>
        </I18nProvider>
      </body>
    </html>
  );
}
