/** Shared display budget: full-width/grapheme = 1, ASCII = 1/2. */
export const normalizeProductName = (value: string) => value.replace(/（/g, "(").replace(/）/g, ")");
export function productNameUnits(value: string): number {
  const segments = typeof Intl.Segmenter === "function"
    ? Array.from(new Intl.Segmenter("zh", { granularity: "grapheme" }).segment(value), item => item.segment)
    : Array.from(value.normalize("NFC"));
  return segments.reduce((total, character) => total + (/^[\x20-\x7e]$/.test(character) ? 0.5 : 1), 0);
}
export function productNameError(value: string) {
  const name = normalizeProductName(value).trim();
  return !name ? "请填写产品名称" : productNameUnits(name) > 15 ? "产品名称最多 15 个全角显示单位（中文计 1，英文、数字及英文括号计 0.5）" : "";
}
