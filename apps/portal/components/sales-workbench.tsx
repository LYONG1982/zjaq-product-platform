"use client";
import { useState, type FormEvent } from "react";
export default function SalesWorkbench({ returnTo = "/", expired = false }: { returnTo?: string; expired?: boolean }) {
  const [username, setUsername] = useState(""), [password, setPassword] = useState("");
  const [message, setMessage] = useState(expired ? "登录已过期或权限发生变化，请重新登录。" : ""), [busy, setBusy] = useState(false);
  const mockAllowed = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_ENABLE_SALES_MOCK === "true";
  async function enter(body: { accessToken?: string; localValidation?: boolean }) {
    const response = await fetch("/api/sales/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store", credentials: "same-origin", redirect: "error" });
    if (!response.ok) { let detail = "登录失败，请稍后重试"; try { detail = (await response.json()).error?.message || detail; } catch { /* empty error */ } throw new Error(detail); }
    window.location.assign(returnTo);
  }
  async function login(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const env = process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID, origin = process.env.NEXT_PUBLIC_CLOUDBASE_AUTH_ORIGIN;
      if (!env || origin !== `https://${env}.api.tcloudbasegateway.com`) throw new Error("身份服务尚未配置，请联系管理员");
      const response = await fetch(origin + "/auth/v1/signin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }), redirect: "error", signal: AbortSignal.timeout(15000) });
      const body = await response.json();
      if (!response.ok || typeof body.access_token !== "string") throw new Error("登录未成功，请检查账号信息");
      await enter({ accessToken: body.access_token });
    } catch (error) { setPassword(""); setMessage(error instanceof Error ? error.message : "登录失败"); }
    finally { setBusy(false); }
  }
  return <main className="sales-workbench"><div className="sales-heading"><div><h1>销售资料工作台</h1><p>登录后可查阅当前产品、技术资料及下载文件。内部资料请仅在授权范围内使用。</p></div></div>
    {message && <p className="sales-message" role="alert">{message}</p>}
    <section className="sales-panel"><h2>销售账号登录</h2><form onSubmit={login} className="sales-login">
      <label>账号<input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required maxLength={150} /></label>
      <label>密码<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required maxLength={256} /></label>
      <button type="submit" disabled={busy}>{busy ? "正在登录…" : "登录"}</button>
    </form>{mockAllowed && <button disabled={busy} onClick={() => { setBusy(true); setMessage(""); void enter({ localValidation: true }).catch((error) => setMessage(error.message)).finally(() => setBusy(false)); }}>进入本地销售验证</button>}</section>
  </main>;
}
