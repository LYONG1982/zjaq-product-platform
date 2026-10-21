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
  return (
    <Viewer
      productId={q.productId ?? ""}
      materialId={q.materialId ?? ""}
      source={q.from}
    />
  );
}
