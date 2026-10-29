import { api } from "../../../components/public-api";
import { ProductDetail } from "../../../components/product-detail";
import { ApiError } from "@zj/api-client";
import Link from "next/link";
import { safeReturnTo } from "../../../components/navigation-context";
export const dynamic = "force-dynamic";
export default async function Detail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const source = safeReturnTo((await searchParams).from);
  const client = await api("/products/" + encodeURIComponent(id) + (source !== "/products" ? "?from=" + encodeURIComponent(source) : ""));
  try {
    const p = (await client.publicProduct(id)).data;
    return (
      <main>
        <ProductDetail product={p} source={source} />
      </main>
    );
  } catch (e) {
    return (
      <main>
        <div className="empty-state" role="alert">
          <h1>
            {e instanceof ApiError && e.status === 404
              ? "产品暂不可用"
              : "暂时无法连接资料服务"}
          </h1>
          <p>请返回目录查看当前产品。</p>
          <Link className="outline-button" href={source}>
            返回产品中心
          </Link>
          <a className="text-link" href={"/products/" + encodeURIComponent(id)}>
            重新加载
          </a>
        </div>
      </main>
    );
  }
}
