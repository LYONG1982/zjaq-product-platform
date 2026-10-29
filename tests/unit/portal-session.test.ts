import test from "node:test";
import assert from "node:assert/strict";
import { openSession, sealSession, sessionCookie, sameOrigin, safeLoginReturn, requestSession } from "../../apps/portal/lib/sales-session";
import { POST, DELETE } from "../../apps/portal/app/api/sales/session/route";

test("PC sales sessions are encrypted, expire, reject tampering, and require production configuration", () => {
  const before = { node: process.env.NODE_ENV, secret: process.env.PORTAL_SESSION_SECRET };
  try {
    process.env.NODE_ENV = "development"; delete process.env.PORTAL_SESSION_SECRET;
    const token = "fictional-test-access", now = Date.now(), sealed = sealSession(token, now);
    assert.ok(!sealed.includes(token)); assert.equal(openSession(sealed, now)?.token, token);
    assert.equal(openSession(sealed, now + 30 * 60000), null);
    assert.equal(openSession((sealed[0] === "A" ? "B" : "A") + sealed.slice(1), now), null);
    assert.equal(openSession("not.a.jwt", now), null);
    assert.match(sessionCookie(sealed), /HttpOnly; SameSite=Strict/);
    assert.equal(requestSession(new Request("http://localhost/", { headers: { Cookie: `zj-sales=${sealed}; zj-sales=${sealed}` } })), null);
    process.env.NODE_ENV = "production";
    assert.throws(() => sealSession(token), /尚未配置/);
    assert.equal(openSession(sealed, now), null);
    process.env.PORTAL_SESSION_SECRET = "12".repeat(32);
    const production = sealSession(token, now);
    assert.equal(openSession(production, now)?.token, token);
    assert.match(sessionCookie(production), /^__Host-zj-sales=.*; Path=\/; HttpOnly; SameSite=Strict; Max-Age=1800; Secure$/);
    process.env.PORTAL_SESSION_SECRET = "34".repeat(32);
    assert.equal(openSession(production, now), null);
  } finally {
    if (before.node === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = before.node;
    if (before.secret === undefined) delete process.env.PORTAL_SESSION_SECRET; else process.env.PORTAL_SESSION_SECRET = before.secret;
  }
});

test("PC login/logout reject cross-origin, unsafe returns, and failed real identity without Mock fallback", async () => {
  const before = { node: process.env.NODE_ENV, mock: process.env.NEXT_PUBLIC_ENABLE_SALES_MOCK, fetch: globalThis.fetch };
  const make = (body: unknown, origin = "http://localhost", site = "same-origin") => new Request("http://localhost/api/sales/session", { method: "POST", headers: { Origin: origin, "Sec-Fetch-Site": site, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  try {
    process.env.NODE_ENV = "development"; process.env.NEXT_PUBLIC_ENABLE_SALES_MOCK = "true";
    assert.equal((await POST(make({ localValidation: true }, "https://outside.example", "cross-site"))).status, 403);
    assert.equal((await DELETE(new Request("http://localhost/api/sales/session", { method: "DELETE" }))).status, 403);
    let calls = 0;
    globalThis.fetch = async (_url, options) => { calls++; assert.equal(new Headers(options?.headers).get("authorization"), "Bearer real-test-token"); return new Response(null, { status: 401 }); };
    assert.equal((await POST(make({ accessToken: "real-test-token" }))).status, 401);
    assert.equal(calls, 1);
    globalThis.fetch = async (_url, options) => { assert.equal(new Headers(options?.headers).get("authorization"), "Bearer local-sales"); return Response.json({ data: { role: "SALES" } }); };
    const accepted = await POST(make({ localValidation: true }));
    assert.equal(accepted.status, 200); assert.match(accepted.headers.get("set-cookie")!, /HttpOnly; SameSite=Strict/);
    assert.ok(!JSON.stringify(await accepted.json()).includes("local-sales"));
    process.env.NODE_ENV = "production";
    assert.equal((await POST(make({ localValidation: true }))).status, 401);
    const cleared = await DELETE(new Request("http://localhost/api/sales/session", { method: "DELETE", headers: { Origin: "http://localhost" } }));
    assert.equal(cleared.status, 200); assert.match(cleared.headers.get("set-cookie")!, /Max-Age=0/);
    assert.equal(sameOrigin(make({}, "http://localhost", "same-site")), false);
    assert.equal(safeLoginReturn("https://outside.example"), "/"); assert.equal(safeLoginReturn("//outside.example/viewer"), "/");
    assert.equal(safeLoginReturn("/viewer?productId=valid&materialId=one"), "/viewer?productId=valid&materialId=one");
  } finally {
    globalThis.fetch = before.fetch;
    if (before.node === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = before.node;
    if (before.mock === undefined) delete process.env.NEXT_PUBLIC_ENABLE_SALES_MOCK; else process.env.NEXT_PUBLIC_ENABLE_SALES_MOCK = before.mock;
  }
});

test("PC resource proxy uses only encrypted sessions, streams Range bodies, and clears expired sessions", async () => {
  const { proxySales } = await import("../../apps/portal/lib/sales-proxy");
  const before = { node: process.env.NODE_ENV, fetch: globalThis.fetch };
  try {
    process.env.NODE_ENV = "development";
    const url = "http://localhost/api/sales/catalog/products/one/materials/two/source?releaseId=r&versionId=v";
    assert.equal((await proxySales(new Request(url, { method: "HEAD" }), ["catalog", "products"])).status, 405);
    assert.equal((await proxySales(new Request(url, { headers: { Authorization: "Bearer local-sales" } }), ["catalog", "products"])).status, 401);
    const cookie = `zj-sales=${sealSession("fictional-test-access")}`;
    let controller!: ReadableStreamDefaultController<Uint8Array>, calls = 0;
    const body = new ReadableStream<Uint8Array>({ start(value) { controller = value; } });
    globalThis.fetch = async (_url, options) => {
      calls++;
      const headers = new Headers(options?.headers);
      assert.equal(headers.get("authorization"), "Bearer fictional-test-access");
      assert.equal(headers.get("cookie"), null); assert.equal(headers.get("range"), "bytes=0-3");
      return new Response(body, { status: 206, headers: { "Content-Type": "application/pdf", "Content-Range": "bytes 0-3/524288000", "Content-Length": "4", "Accept-Ranges": "bytes" } });
    };
    const streamed = await Promise.race([
      proxySales(new Request(url, { headers: { Cookie: cookie, Range: "bytes=0-3" } }), ["catalog", "products", "one", "materials", "two", "source"]),
      new Promise<never>((_resolve, reject) => { const deadline = setTimeout(() => reject(new Error("proxy buffered the pending body")), 1000); deadline.unref(); }),
    ]);
    assert.equal(streamed.status, 206); assert.equal(streamed.headers.get("Content-Range"), "bytes 0-3/524288000");
    assert.equal(streamed.headers.get("Cache-Control"), "private, no-store");
    controller.enqueue(new TextEncoder().encode("%PDF")); controller.close(); assert.equal(await streamed.text(), "%PDF");
    const foreign = new Request(url, { headers: { Cookie: cookie, Origin: "https://outside.example", "Sec-Fetch-Site": "cross-site" } });
    assert.equal((await proxySales(foreign, ["catalog", "products"])).status, 403); assert.equal(calls, 1);
    assert.equal((await proxySales(new Request(url, { headers: { Cookie: cookie } }), ["..", "admin"])).status, 403);
    globalThis.fetch = async () => new Response(null, { status: 401 });
    const expired = await proxySales(new Request(url, { headers: { Cookie: cookie } }), ["me"]);
    assert.equal(expired.status, 401); assert.match(expired.headers.get("set-cookie")!, /Max-Age=0/);
  } finally {
    globalThis.fetch = before.fetch;
    if (before.node === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = before.node;
  }
});
