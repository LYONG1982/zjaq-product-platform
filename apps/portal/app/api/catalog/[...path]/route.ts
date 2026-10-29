import { proxySales } from "../../../../lib/sales-proxy";
export const dynamic = "force-dynamic";
/** Existing PC preview links keep working, but all now use the authenticated sales API. */
export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return proxySales(request, (await params).path, true);
}
