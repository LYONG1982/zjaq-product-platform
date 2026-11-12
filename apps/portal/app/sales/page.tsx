import Link from "next/link";
import { cookies } from "next/headers";
import SalesWorkbench from "../../components/sales-workbench";
import { cookieName, openSession, safeLoginReturn, salesIdentity } from "../../lib/sales-session";
export const dynamic = "force-dynamic";
export default async function SalesPage({ searchParams }: { searchParams: Promise<{ returnTo?: string; expired?: string }> }) {
  const query = await searchParams;
  const session = openSession((await cookies()).get(cookieName())?.value);
  if (session) {
    try {
      const response = await salesIdentity(session.token);
      if (response.ok) {
        const body = (await response.json()) as { data: { displayName: string } };
        return (
          <main className="sales-workbench">
            <div className="sales-heading">
              <div>
                <h1>销售资料工作台</h1>
                <p>当前账号已登录，可直接进入产品中心与资料中心。内部资料请仅在授权范围内使用。</p>
              </div>
            </div>
            <section className="sales-panel">
              <h2>当前账号</h2>
              <p className="sales-account-name">{body.data.displayName}</p>
              <div className="sales-shortcuts">
                <Link href="/products">产品中心</Link>
                <Link href="/materials">资料中心</Link>
              </div>
            </section>
          </main>
        );
      }
    } catch {
      /* 会话校验失败时回落到登录表单 */
    }
  }
  return <SalesWorkbench returnTo={safeLoginReturn(query.returnTo)} expired={query.expired === "1"} />;
}
