import Link from "next/link";
import type { Responses } from "@zj/contracts";
import { mediaUrl, viewerUrl } from "./public-api";
import { ProductVisual } from "./product-visual";
import { withSource } from "./navigation-context";
export function ProductCard({
  item,
  source = "/products",
}: {
  item: Responses["PublicProductSummary"];
  source?: string;
}) {
  const nameCharacters = Array.from(item.name);
  const shortName =
    nameCharacters.length > 15
      ? nameCharacters.slice(0, 15).join("") + "…"
      : item.name;
  return (
    <Link
      className="product-card"
      href={withSource(
        "/products/" + encodeURIComponent(item.productId),
        source,
      )}
    >
      <div className="product-card-body">
        <div className="card-top">
          <ProductVisual
            src={item.coverPath ? mediaUrl(item.coverPath) : null}
            alt={item.name}
            categoryId={item.categoryId}
          />
          <div>
            <h3 aria-label={item.name} title={item.name}>
              {shortName}
            </h3>
            <span className="category-label">{item.categoryName}</span>
          </div>
        </div>
        <p>{item.tagline || "产品介绍待完善"}</p>
        <small className="card-updated">更新于 {new Date(item.publishedAt).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })}</small>
        <span className="card-action">了解产品</span>
      </div>
    </Link>
  );
}
export function MaterialRow({
  item,
  productId,
  productName,
  source = "/materials",
}: {
  item: Responses["PublicMaterial"];
  productId: string;
  productName?: string;
  source?: string;
}) {
  return (
    <div className="material-row">
      <span className="format-icon">
        {item.previewKind === "pdf" ? "PDF" : item.previewKind === "video" ? "视频" : "图集"}
      </span>
      <div>
        <h3>{item.name}</h3>
        {productName && (
          <Link
            className="product-link"
            href={withSource(
              "/products/" + encodeURIComponent(productId),
              source,
            )}
          >
            所属产品：{productName} →
          </Link>
        )}
        <small>
          {item.versionLabel} · {item.previewKind === "video" ? "视频" : `${item.pageCount} 页`} ·{" "}
          {item.publishedAt.slice(0, 10)}
        </small>
      </div>
      <Link
        className="outline-button"
        href={withSource(viewerUrl(productId, item.materialId), source)}
      >
        预览
      </Link>
    </div>
  );
}
