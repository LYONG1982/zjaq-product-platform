import type { Metadata } from "next";
import Link from "next/link";
import "@zj/design-tokens/tokens.css";
import "./globals.css";
export const metadata: Metadata = {
  title: "中技安全产品平台",
  description: "了解产品能力、应用场景与当前资料",
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
          </nav>
          <span className="demo-badge">本地演示</span>
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
