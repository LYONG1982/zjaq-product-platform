import Link from "next/link";
import { api } from "../components/public-api";
import { ProductCard } from "../components/cards";
export const dynamic = "force-dynamic";
export default async function Home() {
  let rows: import("@zj/contracts").Responses["PublicProductSummary"][] = [],
    categories: import("@zj/contracts").Responses["PublicCategory"][] = [],
    failed = false;
  try {
    const c = api();
    const [p, k] = await Promise.all([
      c.publicProducts({ limit: 100 }),
      c.publicCategories(),
    ]);
    const seen = new Set<string>();
    while (p.page.nextCursor) {
      const cursor = p.page.nextCursor;
      if (seen.has(cursor)) throw new Error("Repeated cursor");
      seen.add(cursor);
      const extra = await c.publicProducts({ limit: 100, cursor });
      p.data.push(...extra.data);
      p.page = extra.page;
    }
    rows = p.data;
    categories = k.data;
  } catch {
    failed = true;
  }
  const featured = rows
    ?.filter((p) => p.pilotOrder != null)
    .sort((a, b) => a.pilotOrder! - b.pilotOrder!)
    .slice(0, 6);
  return (
    <main>
      <section className="home-hero">
        <div>
          <h1>
            中技于密，<em>安全于行</em>
          </h1>
          <p>从产品介绍、应用场景到资料预览，一处查阅。</p>
          <form action="/products" className="search-form">
            <input
              name="q"
              aria-label="搜索产品"
              maxLength={100}
              placeholder="搜索产品名称或别名"
            />
            <button>搜索</button>
          </form>
          <Link className="text-link" href="/products">
            浏览全部产品 →
          </Link>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="hero-orbit" />
          <div className="hero-document">
            <span className="hero-document-icon">中技</span>
            <strong>产品 · 场景 · 资料</strong>
            <i />
            <i />
            <i />
            <div className="hero-stamp">清晰可查</div>
          </div>
        </div>
      </section>
      {failed ? (
        <div className="empty-state" role="alert">
          <h2>暂时无法连接资料服务</h2>
          <a className="outline-button" href="/">
            重新加载
          </a>
        </div>
      ) : (
        <>
          <section className="family-grid">
            {categories?.map((c) => (
              <Link
                href={"/products?categoryId=" + encodeURIComponent(c.id)}
                key={c.id}
              >
                <span className="family-symbol" aria-hidden>
                  ▦
                </span>
                <h2>{c.name}</h2>
                <p>{c.productCount} 款产品</p>
                <span aria-hidden>→</span>
              </Link>
            ))}
          </section>
          <section>
            <div className="section-head">
              <h2>首批产品</h2>
              <Link href="/products">查看全部 →</Link>
            </div>
            <div className="product-grid">
              {featured?.map((p) => (
                <ProductCard key={p.productId} item={p} source="/" />
              ))}
            </div>
            {!featured?.length && (
              <div className="empty-state featured-empty">
                <h3>产品资料正在整理</h3>
                <Link className="outline-button" href="/products">
                  浏览产品
                </Link>
              </div>
            )}
          </section>
          <section className="material-callout">
            <div>
              <h2>查找产品资料</h2>
              <p>产品介绍、操作说明与演示资料。</p>
            </div>
            <Link className="primary-button" href="/materials">
              进入资料中心 →
            </Link>
          </section>
        </>
      )}
    </main>
  );
}
