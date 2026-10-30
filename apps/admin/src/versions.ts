/** Suggests the next minor version without guessing an unparseable historical label. */
export function nextMaterialVersion(label: string, used: readonly string[] = []): string | null {
  const match = label.trim().match(/^v(\d+)(?:\.(\d+))?$/i);
  if (!match) return null;
  const occupied = new Set(used.map((item) => item.trim().toUpperCase()));
  let minor = BigInt(match[2] ?? "0") + 1n;
  const major = BigInt(match[1]).toString().padStart(match[1].length, "0");
  let next = `V${major}.${minor}`;
  while (occupied.has(next)) {
    minor++;
    next = `V${major}.${minor}`;
  }
  return next.length <= 40 ? next : null;
}
export function validMaterialVersion(label: string): boolean {
  return /^V\d+\.\d+$/.test(label) && label.length <= 40;
}
