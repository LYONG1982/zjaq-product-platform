import { createRequire } from "node:module";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loopbackDevGuard } from "../../scripts/dev-server-guard";
import { defineConfig } from "vite";
import uniModule from "@dcloudio/vite-plugin-uni";
// DCloud's compiler is CommonJS; Vite's ESM config may wrap its default export.
const uni: typeof uniModule =
  typeof uniModule === "function"
    ? uniModule
    : (uniModule as unknown as { default: typeof uniModule }).default;
const workspaceRequire = createRequire(new URL("../../packages/api-client/package.json", import.meta.url));
// Uni 开发服务器不提供应用根目录的 public，PDF.js 的 worker/字体需单独按 /pdf/* 提供。
// 资源由 scripts/sync-preview-assets.mjs 复制到 apps/mobile/public/pdf，构建时仍由该脚本写入产物目录。
function pdfAssets() {
  const root = resolve(fileURLToPath(new URL("./public/pdf/", import.meta.url)));
  const mime: Record<string, string> = {
    ".mjs": "text/javascript; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".wasm": "application/wasm",
    ".ttf": "font/ttf",
    ".otf": "font/otf",
    ".svg": "image/svg+xml",
  };
  return {
    name: "workspace-h5-pdf-assets",
    apply: "serve" as const,
    configureServer(server: { middlewares: { use: Function } }) {
      server.middlewares.use((req: any, res: any, next: () => void) => {
        const pathname = (req.url ?? "").split("?")[0];
        if (!pathname.startsWith("/pdf/")) return next();
        const file = resolve(root, "." + pathname.slice("/pdf".length));
        if (!file.startsWith(root)) return next();
        stat(file).then((info) => {
          if (!info.isFile()) return next();
          res.writeHead(200, {
            "Content-Type": mime[extname(file)] ?? "application/octet-stream",
            "Content-Length": info.size,
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          });
          if (req.method === "HEAD") res.end();
          else createReadStream(file).pipe(res);
        }).catch(() => next());
      });
    },
  };
}
export default defineConfig({
  // Uni preserves symlink paths; resolve this CJS browser package at its real pnpm location.
  resolve: { alias: { qrcode: workspaceRequire.resolve("qrcode/lib/browser.js") } },
  plugins: [
    loopbackDevGuard(),
    pdfAssets(),
    uni(),
    {
      name: "workspace-h5-chunk-names",
      enforce: "post",
      config() {
        // Uni-App derives names from paths outside src, which can start with '..'.
        // Apply after its config hook so emitted imports stay valid relative ESM.
        if (process.env.UNI_PLATFORM === "h5")
          return {
            build: {
              rollupOptions: {
                output: { chunkFileNames: "assets/chunk-[hash].js" },
              },
            },
          };
      },
    },
  ],
  server: { host: "127.0.0.1", port: 3202, strictPort: true },
});
