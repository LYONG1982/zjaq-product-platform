import { requireSales } from "../../lib/require-sales";
import { Viewer } from "../../components/viewer";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    productId?: string;
    materialId?: string;
    from?: string;
  }>;
}) {
  const q = await searchParams;
  await requireSales("/viewer?" + new URLSearchParams(Object.entries(q).filter((entry): entry is [string, string] => typeof entry[1] === "string")).toString());
  return (
    <Viewer
      productId={q.productId ?? ""}
      materialId={q.materialId ?? ""}
      source={q.from}
    />
  );
}
