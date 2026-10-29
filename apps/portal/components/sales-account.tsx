"use client";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
export function SalesAccount() {
  const path = usePathname(), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => {
    if (path === "/sales") return;
    const check = () => { if (document.visibilityState === "visible") void fetch("/api/sales/me", { cache: "no-store", credentials: "same-origin" }).then((response) => { if (response.status === 401 || response.status === 403) window.location.replace("/sales?expired=1"); }).catch(() => {}); };
    window.addEventListener("pageshow", check); window.addEventListener("focus", check); document.addEventListener("visibilitychange", check);
    return () => { window.removeEventListener("pageshow", check); window.removeEventListener("focus", check); document.removeEventListener("visibilitychange", check); };
  }, [path]);
  if (path === "/sales") return <span className="sales-private">销售内部平台</span>;
  async function logout() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/sales/session", { method: "DELETE", credentials: "same-origin", redirect: "error", cache: "no-store" });
      if (!response.ok) throw new Error("退出未完成，请重试");
      window.location.replace("/sales");
    } catch { setError("退出未完成，请重试"); setBusy(false); }
  }
  return <span className="sales-account"><button disabled={busy} onClick={() => void logout()}>退出登录</button>{error && <span role="alert">{error}</span>}</span>;
}
