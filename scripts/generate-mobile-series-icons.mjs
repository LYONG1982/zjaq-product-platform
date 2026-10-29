import sharp from "sharp";
import { fileURLToPath } from "node:url";
// Keep the editable SVGs and ship a native PNG fallback for WeChat image views.
for (const series of ["miding", "miyi", "mishu", "ai"]) {
  const source = new URL(`../apps/mobile/src/static/series/${series}.svg`, import.meta.url);
  const output = new URL(`../apps/mobile/src/static/series/${series}.png`, import.meta.url);
  await sharp(fileURLToPath(source)).resize(160, 160).png().toFile(fileURLToPath(output));
}
