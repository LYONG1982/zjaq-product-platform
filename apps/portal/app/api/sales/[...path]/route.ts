import { proxySales } from "../../../../lib/sales-proxy";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return proxySales(request, (await params).path);
}
