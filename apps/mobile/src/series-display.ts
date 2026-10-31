/** H5 display names only; persisted category identity and names stay unchanged. */
export const seriesIds = ["miding", "miyi", "mishu", "ai"] as const;
export const seriesThemes: Record<string, { name: string; description: string; narrative: string; start: string; end: string; pattern: string }> = {
  miding: { name: "密鼎", description: "保密应用", narrative: "以清晰能力，回应保密应用需求。", start: "#163b9c", end: "#138dc8", pattern: "196d7.svg" },
  miyi: { name: "密翼", description: "移动终端安全", narrative: "让终端安全，随业务同行。", start: "#056d74", end: "#11a5b5", pattern: "c2bc2.svg" },
  mishu: { name: "密塾", description: "保密教育", narrative: "以学习与实践，理解保密。", start: "#5437aa", end: "#9870d5", pattern: "e60fd.svg" },
  ai: { name: "AI+", description: "人工智能应用", narrative: "让资料与知识，连接更多可能。", start: "#3d40b0", end: "#077b9d", pattern: "4e096.svg" },
};
export function seriesName(id: string, fallback: string) { return seriesThemes[id]?.name ?? fallback; }
export function seriesStyle(id: string) {
  const theme = seriesThemes[id];
  const soft: Record<string, [string, string]> = { miding: ['#ddebff', '#eef6ff'], miyi: ['#daf4f0', '#e8f9fc'], mishu: ['#f8f4fe', '#f0e9fc'], ai: ['#e3e6ff', '#def5fc'] };
  return { "--series-start": theme?.start ?? "#1967f2", "--series-end": theme?.end ?? "#138dc8", "--series-soft-start": soft[id]?.[0] ?? '#e8f0ff', "--series-soft-end": soft[id]?.[1] ?? '#f4f7fc' };
}
