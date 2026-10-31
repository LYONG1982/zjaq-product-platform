import { getSeriesVisual, seriesVisualStyle, seriesIdToVisualKey, seriesVisuals } from "@zj/design-tokens/series-visuals";
export const seriesIds = Object.keys(seriesIdToVisualKey) as (keyof typeof seriesIdToVisualKey)[];
export const seriesThemes = Object.fromEntries(seriesIds.map(id => [id, getSeriesVisual(id)]));
export { getSeriesVisual, seriesVisuals };
export const seriesStyle = seriesVisualStyle;
export function seriesName(id: string, fallback: string) { return getSeriesVisual(id).name || fallback; }
