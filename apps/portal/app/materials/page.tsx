import { Catalog } from "../../components/catalog";
export const dynamic = "force-dynamic";
export default async function Materials({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; categoryId?: string; cursor?: string }>;
}) {
  return <Catalog kind="materials" query={await searchParams} />;
}
