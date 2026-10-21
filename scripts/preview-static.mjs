import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
const root = await realpath(
  resolve(process.argv[2] ?? "apps/mobile/dist/build/h5"),
);
const port = Number(process.argv[3] ?? 3202);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Invalid local preview port");
const hosts = new Set(["127.0.0.1:" + port, "localhost:" + port]);
const origins = new Set([...hosts].map((host) => "http://" + host));
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".wasm": "application/wasm",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};
const server = createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (
    !hosts.has(req.headers.host ?? "") ||
    (req.headers.origin && !origins.has(req.headers.origin))
  ) {
    res.writeHead(403);
    res.end();
    return;
  }
  if (!["GET", "HEAD"].includes(req.method ?? "")) {
    res.writeHead(405);
    res.end();
    return;
  }
  try {
    const pathname = decodeURIComponent(
      new URL(req.url ?? "/", "http://127.0.0.1").pathname,
    );
    const candidate = resolve(
      root,
      "." + (pathname === "/" ? "/index.html" : pathname),
    );
    if (!candidate.startsWith(root + sep)) throw new Error("Outside preview");
    const path = await realpath(candidate);
    if (!path.startsWith(root + sep)) throw new Error("Outside preview");
    const info = await stat(path);
    if (!info.isFile()) throw new Error("Not a file");
    res.writeHead(200, {
      "Content-Type": mime[extname(path)] ?? "application/octet-stream",
      "Content-Length": info.size,
    });
    if (req.method === "HEAD") res.end();
    else
      createReadStream(path)
        .on("error", () => res.destroy())
        .pipe(res);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("内容不可用");
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log("Built static preview: http://127.0.0.1:" + port),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close(() => process.exit(0)));
