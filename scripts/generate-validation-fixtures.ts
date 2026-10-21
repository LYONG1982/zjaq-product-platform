import { docxFixture } from "../tests/fixtures/office-archive";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
const root = new URL("../tests/fixtures/validation/", import.meta.url);
await mkdir(root, { recursive: true });
for (const version of [1, 2]) {
  const doc = await PDFDocument.create();
  doc.setTitle("LOCAL VALIDATION ONLY - fictional sample");
  doc.setAuthor("Local test fixture");
  doc.setCreationDate(new Date("2026-10-19T00:00:00Z"));
  doc.setModificationDate(new Date("2026-10-19T00:00:00Z"));
  const font = await doc.embedFont(StandardFonts.Helvetica),
    bold = await doc.embedFont(StandardFonts.HelveticaBold);
  for (let i = 1; i <= 2; i++) {
    const p = doc.addPage([720, 540]);
    p.drawRectangle({
      x: 0,
      y: 0,
      width: 720,
      height: 540,
      color: rgb(0.96, 0.97, 0.98),
    });
    p.drawRectangle({
      x: 0,
      y: 495,
      width: 720,
      height: 45,
      color: rgb(0.06, 0.18, 0.26),
    });
    p.drawText("LOCAL VALIDATION ONLY", {
      x: 40,
      y: 512,
      size: 14,
      font: bold,
      color: rgb(1, 1, 1),
    });
    p.drawText(`Fictional product workflow - v${version}`, {
      x: 40,
      y: 435,
      size: 26,
      font: bold,
      color: rgb(0.06, 0.18, 0.26),
    });
    p.drawText(`Sample page ${i} of 2`, {
      x: 40,
      y: 397,
      size: 17,
      font,
      color: rgb(0.03, 0.49, 0.51),
    });
    const lines = [
      "This document is synthetic test data.",
      "It is not a description of a real product.",
      "No customer, performance claim or commercial specification is represented.",
      i === 1
        ? "Check: draft preview, publish, and immutable document version."
        : "Check: page order, replacement, and access after unpublish.",
      `Version marker: ${version === 1 ? "ORIGINAL V1" : "UPDATED V2"}`,
    ];
    lines.forEach((line, k) =>
      p.drawText(line, {
        x: 40,
        y: 330 - k * 32,
        size: 14,
        font,
        color: rgb(0.1, 0.19, 0.27),
      }),
    );
    p.drawText(`NOT FOR PUBLIC RELEASE / ${i}`, {
      x: 40,
      y: 40,
      size: 11,
      font: bold,
      color: rgb(0.58, 0.38, 0),
    });
  }
  await writeFile(
    new URL(`sample-v${version}.pdf`, root),
    await doc.save({ useObjectStreams: false }),
  );
}
for (let i = 1; i <= 3; i++) {
  const svg = `<svg width="960" height="720" xmlns="http://www.w3.org/2000/svg"><rect width="960" height="720" fill="#f5f7f9"/><rect width="960" height="72" fill="#112d42"/><text x="48" y="47" font-family="sans-serif" font-size="26" fill="white">LOCAL VALIDATION ONLY</text><text x="48" y="175" font-family="sans-serif" font-size="40" fill="#112d42">Fictional device document</text><text x="48" y="240" font-family="sans-serif" font-size="32" fill="#087f82">Page ${i} of 3</text><rect x="48" y="300" width="864" height="260" rx="12" fill="#eaf5f4"/><text x="80" y="420" font-family="sans-serif" font-size="56" fill="#087f82">${i}</text><text x="190" y="410" font-family="sans-serif" font-size="24" fill="#173046">Explicit page order test</text><text x="190" y="455" font-family="sans-serif" font-size="20" fill="#173046">No real product specifications</text><text x="48" y="655" font-family="sans-serif" font-size="20" fill="#946200">SYNTHETIC DATA - NOT FOR PUBLIC RELEASE</text></svg>`;
  await writeFile(
    new URL(`page-${i}.png`, root),
    await sharp(Buffer.from(svg)).png().toBuffer(),
  );
}
await writeFile(new URL("sample-source.docx", root), docxFixture());
await writeFile(new URL("malformed-source.docx", root), docxFixture(true));
await writeFile(new URL("fake-pdf.txt", root), "<html>Not a PDF</html>");
await writeFile(
  new URL("README.md", root),
  "# 本地验证资料\n\n全部为虚构测试内容，与原 27 款真实主档无关。sample-v1／v2 各两页，page-1—3 为有序图片。fake-pdf.txt 用于伪装文件拒绝测试。没有真实产品参数、客户或授权素材。由 scripts/generate-validation-fixtures.ts 可复现生成。仅在功能验证完成后通过 demo:seed 加入本地 Mock。\n",
);
console.log(
  "Generated two PDF versions and three ordered images; no API data was changed.",
);
