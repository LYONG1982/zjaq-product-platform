import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { mkdir, cp } from "node:fs/promises";
const require = createRequire(
  new URL("../packages/api-client/package.json", import.meta.url),
);
const workspace = dirname(
  fileURLToPath(new URL("../package.json", import.meta.url)),
);
const root = dirname(require.resolve("pdfjs-dist/package.json"));
// 构建 H5 时输出到 dist；开发时门户与 H5 都从各自 public/pdf 提供同一份自托管资源。
for (const dest of process.argv.includes("--h5")
  ? [
      resolve(
        process.env.UNI_OUTPUT_DIR ??
          resolve(workspace, "apps/mobile/dist/build/h5"),
        "pdf",
      ),
    ]
  : [
      resolve(workspace, "apps/portal/public/pdf"),
      resolve(workspace, "apps/mobile/public/pdf"),
    ]) {
  await mkdir(dest, { recursive: true });
  for (const name of [
    // legacy 构建自带 core-js polyfill，兼容尚未提供 Map.getOrInsertComputed 的浏览器。
    "legacy/build/pdf.worker.min.mjs",
    "cmaps",
    "standard_fonts",
    "wasm",
  ])
    await cp(resolve(root, name), resolve(dest, name.replace(/^(?:legacy\/)?build\//, "")), {
      recursive: true,
    });
}
