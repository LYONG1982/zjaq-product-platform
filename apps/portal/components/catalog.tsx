import Link from "next/link";
import { api } from "./public-api";
import { ProductCard, MaterialRow } from "./cards";
import { ListPosition } from "./list-position";
type Query = { q?: string; categoryId?: string; cursor?: string; ownership?: string; updatedFrom?: string; updatedTo?: string };
export async function Catalog({
  kind = "products",
  query = {},
}: {
  kind?: "products" | "materials";
  query?: Query;
}) {
  query = Object.fromEntries(Object.entries(query).filter((entry): entry is [string, string] => typeof entry[1] === "string" && !!entry[1].trim()));
  let content: React.ReactNode;
  const sourceQuery = new URLSearchParams(
    Object.entries(query).filter(
      (e): e is [string, string] => typeof e[1] === "string",
    ),
  ).toString();
  const source = "/" + kind + (sourceQuery ? "?" + sourceQuery : "");
  const title = kind === "products" ? "产品中心" : "资料中心";
  const href = (categoryId?: string, cursor?: string) => ({
    pathname: "/" + kind,
    query: {
      ...(query.q ? { q: query.q } : {}),
      ...(query.ownership ? { ownership: query.ownership } : {}),
      ...(query.updatedFrom ? { updatedFrom: query.updatedFrom } : {}),
      ...(query.updatedTo ? { updatedTo: query.updatedTo } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(cursor ? { cursor } : {}),
    },
  });
  const client = await api(source);
  try {
    const [categories, result] = await Promise.all([
      client.publicCategories(),
      kind === "products"
        ? client.publicProducts(query)
        : client.materials(query),
    ]);
    content = (
      <>
        <div className="filter-line">
          <Link
            className={!query.categoryId ? "chip active" : "chip"}
            href={href()}
          >
            全部
          </Link>
          {categories.data.map((c) => (
            <Link
              key={c.id}
              className={query.categoryId === c.id ? "chip active" : "chip"}
              href={href(c.id)}
            >
              {c.name}
            </Link>
          ))}
        </div>
        {result.data.length ? (
          <>
            <div
              className={kind === "products" ? "product-grid" : "material-list"}
            >
              {result.data.map((item) =>
                "name" in item ? (
                  <ProductCard
                    item={item}
                    key={item.productId}
                    source={source}
                  />
                ) : (
                  <MaterialRow
                    key={item.productId + item.material.materialId}
                    item={item.material}
                    productId={item.productId}
                    productName={item.productName}
                    source={source}
                  />
                ),
              )}
            </div>
            <div className="pagination">
              {query.cursor && (
                <Link href={href(query.categoryId)}>返回第一页</Link>
              )}
              {result.page.nextCursor && (
                <Link
                  className="outline-button"
                  href={href(query.categoryId, result.page.nextCursor)}
                >
                  下一页 →
                </Link>
              )}
            </div>
          </>
        ) : (
          <div className="empty-state">
            <h2>
              {query.q || query.categoryId
                ? "没有找到相关内容"
                : "暂无发布内容"}
            </h2>
            <p>
              {query.q || query.categoryId
                ? "换个关键词或清除筛选条件。"
                : "发布后可在这里查阅。"}
            </p>
            <Link className="outline-button" href={"/" + kind}>
              清除筛选
            </Link>
          </div>
        )}
      </>
    );
  } catch {
    content = (
      <div className="empty-state" role="alert">
        <h2>暂时无法连接资料服务</h2>
        <p>请稍后重试。</p>
        <a
          className="outline-button"
          href={
            "/" +
            kind +
            "?" +
            new URLSearchParams(
              Object.entries(query).filter(
                (e): e is [string, string] => typeof e[1] === "string",
              ),
            ).toString()
          }
        >
          重新加载
        </a>
      </div>
    );
  }
  return (
    <main>
      <ListPosition />
      <section className="catalog-heading">
        <div>
          <h1>{title}</h1>
          <p>
            {kind === "products"
              ? "按分类查找产品与应用场景。"
              : "查阅产品当前资料。"}
          </p>
        </div>
        <form className="search-form catalog-search" action={"/" + kind}>
          {query.categoryId && (
            <input type="hidden" name="categoryId" value={query.categoryId} />
          )}
          <input
            name="q"
            aria-label={kind === "products" ? "搜索产品" : "搜索资料"}
            maxLength={100}
            defaultValue={query.q ?? ""}
            placeholder={
              kind === "products" ? "搜索产品名称或别名" : "搜索资料或产品名称"
            }
          />
          {kind === "products" && <>
            <label className="catalog-filter">产品属性<select name="ownership" defaultValue={query.ownership ?? ""}><option value="">全部属性</option><option value="SELF_DEVELOPED">自研</option><option value="PARTNER">合作</option></select></label>
            <label className="catalog-filter">更新开始日期<input name="updatedFrom" type="date" defaultValue={query.updatedFrom ?? ""} /></label>
            <label className="catalog-filter">更新结束日期<input name="updatedTo" type="date" defaultValue={query.updatedTo ?? ""} /></label>
          </>}
          <button>搜索</button>
          <Link className="clear-filter" href={"/" + kind}>重置</Link>
          {(query.q || query.categoryId) && (
            <Link className="clear-filter" href={"/" + kind}>
              清除筛选
            </Link>
          )}
        </form>
      </section>
      {content}
    </main>
  );
}
