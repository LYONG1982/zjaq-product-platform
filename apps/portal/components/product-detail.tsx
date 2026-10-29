import type { Responses } from "@zj/contracts";
import Link from "next/link";
import { MaterialRow } from "./cards";
import { ProductVisual } from "./product-visual";
import { safeReturnTo, withSource } from "./navigation-context";
import { mediaUrl } from "./public-api";
import { technicalLabels } from "@zj/api-client";

export function ProductDetail({
  product: p,
  source = "/products",
}: {
  product: Responses["PublicProduct"];
  source?: string;
}) {
  const detailSource = withSource(
    "/products/" + encodeURIComponent(p.productId),
    safeReturnTo(source),
  );
  const cover = p.media.find((m) => m.role === "cover");
  const groups = [
    ["problemValues", "问题与价值"],
    ["features", "核心能力"],
    ["scenarios", "应用场景"],
  ] as const;
  return (
    <>
      <Link href={safeReturnTo(source)} className="text-link">
        ← 返回上一页
      </Link>
      <section className={"detail-hero" + (!cover ? " without-cover" : "")}>
        <div>
          <span className="category-label">{p.category.name}</span>
          <h1>{p.name}</h1>
          {p.model && <p>产品型号：{p.model}</p>}
          {p.tagline.trim() && <h2>{p.tagline}</h2>}
          {p.summary.trim() && <div className="product-summary">{p.summary.replace(/\r\n?/g, "\n").split(/\n+/).filter((paragraph) => paragraph.trim()).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>}
          {p.audiences?.trim() && (
            <p className="audiences">适用对象：{p.audiences}</p>
          )}
          <a href="#materials" className="primary-button">
            查看资料 ↓
          </a>
        </div>
        {cover && (
          <ProductVisual src={mediaUrl(cover.path)} alt={cover.alt} large />
        )}
      </section>
      <nav className="detail-nav" aria-label="产品章节">
        {groups
          .filter(([key]) => p[key].length)
          .map(([key, label]) => (
            <a key={key} href={"#" + key}>
              {label}
            </a>
          ))}
        <a href="#materials">产品资料</a>
      </nav>
      {groups.map(
        ([key, label]) =>
          p[key].length > 0 && (
            <section className="detail-section" id={key} key={key}>
              <h2>{label}</h2>
              <div className="feature-grid">
                {p[key].map((item) => (
                  <article key={item.id}>
                    <h3>{item.title}</h3>
                    <p>{item.text}</p>
                  </article>
                ))}
              </div>
            </section>
          ),
      )}
      {p.media.filter((m) => m.role !== "cover").length > 0 && (
        <section className="detail-section">
          <h2>产品展示</h2>
          <div className="media-grid">
            {p.media
              .filter((m) => m.role !== "cover")
              .map((m) => (
                <figure key={m.mediaId}>
                  <ProductVisual src={mediaUrl(m.path)} alt={m.alt} large />
                  <figcaption>{m.alt}</figcaption>
                </figure>
              ))}
          </div>
        </section>
      )}
      {Object.keys(p.technical).length > 0 && (
        <section className="detail-section">
          <h2>技术与使用说明</h2>
          <dl className="technical-grid">
            {Object.entries(p.technical).map(([key, value]) => (
              <div key={key}>
                <dt>{technicalLabels[key] ?? key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      <section className="detail-section" id="materials">
        <h2>产品资料</h2>
        <div className="material-list">
          {p.materials.map((m) => (
            <MaterialRow
              key={m.materialId}
              item={m}
              productId={p.productId}
              source={detailSource + "#materials"}
            />
          ))}
          {!p.materials.length && <p className="empty-state">暂无可预览资料</p>}
        </div>
      </section>
    </>
  );
}
