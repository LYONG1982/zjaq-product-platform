import type { Responses } from "@zj/contracts";
import { ShareButton } from "./share-button";
import Link from "next/link";
import { MaterialRow } from "./cards";
import { safeReturnTo, withSource } from "./navigation-context";
import { mediaUrl } from "./public-api";
import { ProductImages } from "./product-images";

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
  const groups = [
    ["problemValues", "问题与价值"],
    ["features", "核心能力"],
    ["scenarios", "应用场景"],
  ] as const;
  return (
    <>
      <Link href={safeReturnTo(source)} className="product-back-button">
        ← 返回上一页
      </Link>
      <ShareButton productId={p.productId} />
      <section className="detail-hero without-cover">
        <div>
          <span className="category-label">{p.category.name}</span>
          <h1>{p.name}</h1>
          {p.model && <p>产品型号：{p.model}</p>}
          {p.tagline.trim() && <h2>{p.tagline}</h2>}
          {p.summary.trim() && <div className="product-summary">{p.summary.replace(/\r\n?/g, "\n").split(/\n+/).map(paragraph => paragraph.trim()).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>}
          {p.audiences?.trim() && (
            <p className="audiences">适用对象：{p.audiences}</p>
          )}
          <a href="#materials" className="primary-button">
            查看资料 ↓
          </a>
        </div>
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
      {p.media.length > 0 && <section className="detail-section"><h2>产品介绍图片</h2><ProductImages images={p.media.map(m => ({ src: mediaUrl(m.path), alt: m.alt, id: m.mediaId }))} /></section>}
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
