export type CatalogKind = "home" | "products" | "materials";
export const catalogState: Record<
  CatalogKind,
  { q: string; category: string; scroll: number; count: number }
> = {
  home: { q: "", category: "", scroll: 0, count: 0 },
  products: { q: "", category: "", scroll: 0, count: 0 },
  materials: { q: "", category: "", scroll: 0, count: 0 },
};
export function openCatalog(q = "", category = "") {
  Object.assign(catalogState.products, { q, category, scroll: 0, count: 0 });
  uni.switchTab({ url: "/pages/products/index" });
}
export function safeSource(
  value: string | undefined,
  fallback = "/pages/products/index",
) {
  return value &&
    (/^\/pages\/(home|products|materials)\/index$/.test(value) ||
      /^\/pages\/detail\/index\?id=[A-Za-z0-9_-]+$/.test(value))
    ? value
    : fallback;
}
export function backToSource(source: string) {
  if (getCurrentPages().length > 1) uni.navigateBack();
  else if (source.startsWith("/pages/detail/"))
    uni.redirectTo({ url: safeSource(source) });
  else uni.switchTab({ url: safeSource(source) });
}
