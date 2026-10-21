// Public-only same-origin proxy: no admin routes, cookies, or credentials forwarded.
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  if (path.some((p) => !p || p === ".." || /[\\/?#]/.test(p)))
    return new Response(null, { status: 400 });
  const base =
    process.env.PORTAL_API_BASE_URL ?? "http://127.0.0.1:3100/api/v1";
  const target = new URL(
    base.replace(/\/$/, "") +
      "/catalog/" +
      path.map(encodeURIComponent).join("/"),
  );
  target.search = new URL(request.url).search;
  try {
    const response = await fetch(target, {
      cache: "no-store",
      headers: request.headers.has("range")
        ? { range: request.headers.get("range")! }
        : {},
      signal: AbortSignal.timeout(20000),
      redirect: "error",
    });
    const headers = new Headers({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    for (const key of [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
      "content-disposition",
      "x-request-id",
    ]) {
      const v = response.headers.get(key);
      if (v) headers.set(key, v);
    }
    return new Response(response.body, { status: response.status, headers });
  } catch {
    return Response.json(
      { error: { code: "SERVICE_UNAVAILABLE", message: "资料服务暂不可用" } },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
