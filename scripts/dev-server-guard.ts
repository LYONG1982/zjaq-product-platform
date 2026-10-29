import type { IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
type DevServer = {
  config: { server: { port?: number } };
  httpServer?: {
    address(): { port: number } | string | null;
    prependListener(event: string | symbol, listener: (...args: any[]) => void): unknown;
    removeListener(event: string | symbol, listener: (...args: any[]) => void): unknown;
    once(event: string | symbol, listener: (...args: any[]) => void): unknown;
  } | null;
  middlewares: { use(handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void): unknown };
};
function loopback(address?: string) { return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1"; }
function allowedHost(value: string | undefined, port: number) {
  if (!value || value.length > 128) return false;
  const match = /^(127\.0\.0\.1|localhost):([1-9]\d{0,4})$/i.exec(value);
  return !!match && Number(match[2]) === port;
}
export function safeDevRequest(req: IncomingMessage, port: number) {
  if (!loopback(req.socket.remoteAddress) || !allowedHost(req.headers.host, port)) return false;
  const origin = req.headers.origin;
  if (origin !== undefined) {
    if (typeof origin !== "string") return false;
    try {
      const parsed = new URL(origin);
      if (parsed.origin !== origin || !["http:", "https:"].includes(parsed.protocol) || !allowedHost(parsed.host, port)) return false;
    } catch { return false; }
  }
  const site = req.headers["sec-fetch-site"];
  if (site !== undefined && (typeof site !== "string" || !["none", "same-site", "same-origin"].includes(site))) return false;
  let path: string;
  try {
    path = new URL(req.url ?? "/", "http://localhost").pathname;
    for (let i = 0; i < 3; i++) { const next = decodeURIComponent(path); if (next === path) break; path = next; }
    path = path.replace(/\\/g, "/");
  } catch { return false; }
  return !path.split("/").includes("__open-in-editor");
}
/** Defense for the pinned Uni-App/Vite development toolchain; not an advisory-clearance claim. */
export function loopbackDevGuard() {
  return {
    name: "workspace-loopback-dev-guard",
    apply: "serve" as const,
    enforce: "pre" as const,
    configureServer(server: DevServer) {
      const port = () => {
        const address = server.httpServer?.address();
        return address && typeof address === "object" ? address.port : server.config.server.port ?? 0;
      };
      server.middlewares.use((req, res, next) => {
        if (safeDevRequest(req, port())) { next(); return; }
        res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
        res.end("Development server request blocked");
      });
      const upgrade = (req: IncomingMessage, socket: Duplex) => {
        if (!safeDevRequest(req, port())) socket.destroy();
      };
      // A rejected browser HMR handshake is destroyed before later Vite listeners run.
      server.httpServer?.prependListener("upgrade", upgrade);
      server.httpServer?.once("close", () => server.httpServer?.removeListener("upgrade", upgrade));
    },
  };
}
