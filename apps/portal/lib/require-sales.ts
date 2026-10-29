import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cookieName, openSession, safeLoginReturn, salesIdentity } from "./sales-session";
export async function requireSales(returnTo = "/") {
  const session = openSession((await cookies()).get(cookieName())?.value);
  if (!session) redirect("/sales?returnTo=" + encodeURIComponent(safeLoginReturn(returnTo)));
  let status = 503;
  try { status = (await salesIdentity(session.token)).status; } catch { /* service errors are displayed by the page, never replaced with Mock */ }
  if (status === 401 || status === 403) redirect("/sales?expired=1&returnTo=" + encodeURIComponent(safeLoginReturn(returnTo)));
  return session.token;
}
