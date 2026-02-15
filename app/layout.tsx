import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "RDV 点餐",
  description: "酒店/餐厅手机点餐系统 MVP"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <main>
          {children}
        </main>
      </body>
    </html>
  );
}
