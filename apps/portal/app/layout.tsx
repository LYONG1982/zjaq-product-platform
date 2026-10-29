import type { Metadata } from "next";
import Link from "next/link";
import { SalesAccount } from "../components/sales-account";
import "@zj/design-tokens/tokens.css";
import "./globals.css";
export const metadata: Metadata = {
  title: "中技安全产品平台",
  description: "销售内部产品资料工作台",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <header className="site-header">
          <Link className="brand" href="/">
            <span className="brand-mark">中技</span>
            <span>
              中技安全<span className="brand-sub">产品平台</span>
            </span>
          </Link>
          <nav aria-label="主导航">
            <Link href="/">首页</Link>
            <Link href="/products">产品中心</Link>
            <Link href="/materials">资料中心</Link>
            <Link href="/sales">销售工作台</Link>
          </nav>
          <SalesAccount />
        </header>
        {children}
        <footer>
          <span>中技安全产品平台</span>
          <span>资料以当前发布版本为准</span>
        </footer>
      </body>
    </html>
  );
}
