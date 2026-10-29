import { Catalog } from "../../components/catalog";
export const dynamic = "force-dynamic";
export default async function Products({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; categoryId?: string; cursor?: string; ownership?: string; updatedFrom?: string; updatedTo?: string }>;
}) {
  return <Catalog query={await searchParams} />;
}
