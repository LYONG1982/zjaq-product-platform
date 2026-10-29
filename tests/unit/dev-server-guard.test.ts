import test from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from "node:http";
import { connect } from "node:net";
import { once } from "node:events";
import { loopbackDevGuard, safeDevRequest } from "../../scripts/dev-server-guard";
test("development guard rejects untrusted host, origin, browser cross-site and editor route while allowing loopback tooling", async () => {
  let middleware!: (req: IncomingMessage, res: ServerResponse, next: () => void) => void;
  const server = createServer((req, res) => middleware(req, res, () => { res.writeHead(200); res.end("safe"); }));
  loopbackDevGuard().configureServer({ config: { server: { port: 1 } }, httpServer: server, middlewares: { use: (handler) => { middleware = handler; } } });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address === "object"); const port = address.port, base = `http://127.0.0.1:${port}`;
  const get = (path = "/", headers: Record<string, string | undefined> = {}) => new Promise<number>((resolve, reject) => {
    const req = httpRequest(base + path, { headers }, (res) => { res.resume(); res.on("end", () => resolve(res.statusCode!)); }); req.on("error", reject); req.end();
  });
  try {
    assert.equal(await get(), 200);
    assert.equal(await get("/", { Origin: base, "Sec-Fetch-Site": "same-origin" }), 200);
    assert.equal(await get("/", { Host: `localhost:${port}`, Origin: `http://localhost:${port}` }), 200);
    for (const headers of [{ Host: `evil.example:${port}` }, { Host: "127.0.0.1:1" }, { Origin: "https://evil.example" }, { Origin: base + "/" }, { Origin: "null" }, { "Sec-Fetch-Site": "cross-site" }]) assert.equal(await get("/", headers), 403, JSON.stringify(headers));
    for (const path of ["/__open-in-editor?file=demo.vue", "/%5f%5fopen-in-editor", "/%255f%255fopen-in-editor"]) assert.equal(await get(path), 403);
    const remote = { socket: { remoteAddress: "192.0.2.1" }, headers: { host: `localhost:${port}` }, url: "/" } as IncomingMessage;
    assert.equal(safeDevRequest(remote, port), false);
  } finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
});
test("development guard also rejects cross-origin HMR upgrade before the websocket handler", async () => {
  const server = createServer(), accepted: string[] = [];
  // Existing listeners are deliberately installed first to verify prepend ordering.
  server.on("upgrade", (req, socket) => { if (socket.destroyed) return; accepted.push(req.url!); socket.end("HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n"); });
  loopbackDevGuard().configureServer({ config: { server: { port: 1 } }, httpServer: server, middlewares: { use: () => {} } });
  server.listen(0, "127.0.0.1"); await once(server, "listening"); const address = server.address(); assert.ok(address && typeof address === "object"); const port = address.port;
  const request = (origin: string) => new Promise<string>((resolve, reject) => {
    const socket = connect(port, "127.0.0.1"), chunks: Buffer[] = [];
    socket.setTimeout(2000, () => { socket.destroy(); reject(new Error("upgrade timed out")); });
    socket.on("data", (data) => chunks.push(data)); socket.on("error", (error: NodeJS.ErrnoException) => error.code === "ECONNRESET" ? resolve("") : reject(error)); socket.on("close", () => resolve(Buffer.concat(chunks).toString()));
    socket.on("connect", () => socket.write(`GET /hmr HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nOrigin: ${origin}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n`));
  });
  try { assert.equal(await request("http://evil.example"), ""); assert.match(await request(`http://127.0.0.1:${port}`), /101 Switching Protocols/); assert.equal(accepted.length, 1); }
  finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
});
