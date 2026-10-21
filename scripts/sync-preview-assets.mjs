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
for (const dest of process.argv.includes("--h5")
  ? [
      resolve(
        process.env.UNI_OUTPUT_DIR ??
          resolve(workspace, "apps/mobile/dist/build/h5"),
        "pdf",
      ),
    ]
  : [resolve(workspace, "apps/portal/public/pdf")]) {
  await mkdir(dest, { recursive: true });
  for (const name of [
    "build/pdf.worker.min.mjs",
    "cmaps",
    "standard_fonts",
    "wasm",
  ])
    await cp(resolve(root, name), resolve(dest, name.replace("build/", "")), {
      recursive: true,
    });
}
