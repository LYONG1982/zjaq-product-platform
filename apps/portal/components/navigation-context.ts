/** Restrict return destinations to known public pages on this site. */
export function safeReturnTo(
  value: string | undefined,
  fallback = "/products",
  depth = 0,
): string {
  if (
    !value ||
    value.length > 2000 ||
    depth > 3 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u001f]/.test(value)
  )
    return fallback;
  try {
    const u = new URL(value, "http://local.invalid");
    if (
      u.origin !== "http://local.invalid" ||
      !/^\/(?:products(?:\/[A-Za-z0-9_-]+)?|materials)?$/.test(u.pathname)
    )
      return fallback;
    const q = new URLSearchParams();
    for (const name of ["q", "categoryId", "cursor"]) {
      const v = u.searchParams.get(name);
      if (v) q.set(name, v.slice(0, 512));
    }
    const from = u.searchParams.get("from");
    if (from && /^\/products\//.test(u.pathname))
      q.set("from", safeReturnTo(from, "/products", depth + 1));
    const query = q.toString();
    return (
      u.pathname +
      (query ? "?" + query : "") +
      (u.hash === "#materials" ? u.hash : "")
    );
  } catch {
    return fallback;
  }
}
export const withSource = (url: string, source: string) =>
  url +
  (url.includes("?") ? "&" : "?") +
  "from=" +
  encodeURIComponent(safeReturnTo(source));
