import SalesWorkbench from "../../components/sales-workbench";
import { safeLoginReturn } from "../../lib/sales-session";
export const dynamic = "force-dynamic";
export default async function SalesPage({ searchParams }: { searchParams: Promise<{ returnTo?: string; expired?: string }> }) {
  const query = await searchParams;
  return <SalesWorkbench returnTo={safeLoginReturn(query.returnTo)} expired={query.expired === "1"} />;
}
