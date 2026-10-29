import { requireValue } from "./errors";

export type ProductType = "SOFTWARE" | "HARDWARE";
export type ProductOwnership = "SELF_DEVELOPED" | "PARTNER";
const seriesCodes: Record<string, string> = { miding: "D", miyi: "Y", mishu: "S", ai: "A" };
const typeCodes: Record<ProductType, string> = { SOFTWARE: "S", HARDWARE: "H" };
const ownershipCodes: Record<ProductOwnership, string> = { SELF_DEVELOPED: "A", PARTNER: "B" };

/** Requires a sequence allocated transactionally by the caller. */
export function productCode(categoryId: string, productType: ProductType, ownership: ProductOwnership, sequence: number) {
  requireValue(Object.hasOwn(seriesCodes, categoryId), 422, "INVALID_ARGUMENT", "请选择支持编码的产品系列");
  requireValue(Object.hasOwn(typeCodes, productType), 422, "INVALID_ARGUMENT", "请选择产品类型");
  requireValue(Object.hasOwn(ownershipCodes, ownership), 422, "INVALID_ARGUMENT", "请选择产品属性");
  requireValue(Number.isSafeInteger(sequence) && sequence > 0 && sequence <= 999, 422, "INVALID_ARGUMENT", "产品编码序号须在 001 至 999 之间");
  return `ZJ-${seriesCodes[categoryId]}-${typeCodes[productType]}-${ownershipCodes[ownership]}-${String(sequence).padStart(3, "0")}`;
}
export function productCodePrefix(categoryId: string, productType: ProductType, ownership: ProductOwnership) {
  return productCode(categoryId, productType, ownership, 1).slice(0, -4);
}
export function normalizedModel(model: string) {
  return model.trim().normalize("NFKC").toLocaleLowerCase("en-US");
}
