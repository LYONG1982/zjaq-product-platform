/** Figma V3: visual keys are explicitly adapted from persisted category IDs. */
export const seriesIdToVisualKey = { miding: "ding", miyi: "yi", mishu: "shu", ai: "ai" } as const;
export type SeriesVisualKey = (typeof seriesIdToVisualKey)[keyof typeof seriesIdToVisualKey];
export type SeriesVisual = { key: SeriesVisualKey | "unknown"; name: string; description: string; narrative: string; assetFile: string | null; start: string; end: string; accent: string };
export const seriesVisuals: Record<SeriesVisualKey, SeriesVisual> = {
  ding: { key: "ding", name: "密鼎", description: "保密应用", narrative: "以清晰能力，回应保密应用需求。", assetFile: "miding.webp", start: "#fafbfd", end: "#b2d6fd", accent: "#2166ec" },
  yi: { key: "yi", name: "密翼", description: "移动终端安全", narrative: "让终端安全，随业务同行。", assetFile: "miyi.webp", start: "#f8fbfd", end: "#b9eee7", accent: "#087e83" },
  shu: { key: "shu", name: "密塾", description: "保密教育", narrative: "以学习与实践，理解保密。", assetFile: "mishu.webp", start: "#fcfafd", end: "#d3baf5", accent: "#7751be" },
  ai: { key: "ai", name: "AI+", description: "人工智能应用", narrative: "让资料与知识，连接更多可能。", assetFile: "ai.webp", start: "#fdfbfd", end: "#b8c3fd", accent: "#5b5fd6" },
};
const unknown: SeriesVisual = { key: "unknown", name: "", description: "", narrative: "产品介绍与当前资料", assetFile: null, start: "#f4f7fc", end: "#e2eaf4", accent: "#60748b" };
export function getSeriesVisual(categoryId?: string | null): SeriesVisual {
  return categoryId && Object.hasOwn(seriesIdToVisualKey, categoryId)
    ? seriesVisuals[seriesIdToVisualKey[categoryId as keyof typeof seriesIdToVisualKey]] : unknown;
}
export function seriesVisualStyle(categoryId?: string | null): Record<string, string> {
  const v = getSeriesVisual(categoryId);
  return { "--series-bg-start": v.start, "--series-bg-end": v.end, "--series-accent": v.accent,
    "--series-start": v.accent, "--series-end": v.accent, "--series-soft-start": v.start, "--series-soft-end": v.end };
}
