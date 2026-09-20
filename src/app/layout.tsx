import type { Metadata } from "next";
import { WorkspaceProvider } from "@/stores/workspace-store";
import "./globals.css";

export const metadata: Metadata = { title: "JobDeck · AI 求职工作台", description: "AI 大模型应用工程师求职工作台 Mock MVP" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body><WorkspaceProvider>{children}</WorkspaceProvider></body></html>;
}
