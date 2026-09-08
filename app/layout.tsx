import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "画课｜儿童美术课堂演示",
  description: "从课程条件确认到应用内 HTML 课堂演示的备课工作台",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
