import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const series = { miding: "D", miyi: "Y", mishu: "S", ai: "A" };
const types = { SOFTWARE: "S", HARDWARE: "H" };
const ownershipCodes = { SELF_DEVELOPED: "A", PARTNER: "B" };

/** Pure preflight: no database connections, writes, or invented product attributes. */
export function preflight(products, confirmations = [], occupiedIds = [], checks = {}) {
  if (!Array.isArray(products) || !Array.isArray(confirmations) || !Array.isArray(occupiedIds))
    throw new Error("产品、确认项和已占用编码均须为数组");
  const known = new Set(products.map((p) => p.productId));
  if (known.size !== products.length) throw new Error("产品旧编码重复");
  const supplied = new Map();
  for (const item of confirmations) {
    if (!item || !known.has(item.productId) || supplied.has(item.productId))
      throw new Error("确认项包含未知或重复的产品编码");
    supplied.set(item.productId, item);
  }
  const problems = [];
  if (checks.inventoryConfirmed !== true || checks.referencesConfirmed !== true)
    problems.push({ oldProductId: null, issues: ["目标编码清单或引用清单尚未核实"] });
  const models = new Map();
  const ready = [];
  for (const p of [...products].sort((a, b) => a.productId.localeCompare(b.productId, "en", { numeric: true }))) {
    const source = supplied.get(p.productId);
    const issues = [];
    if (!/^ZJ-\d{3,}$/.test(p.productId)) issues.push("旧编码格式无效");
    if (!Object.hasOwn(series, p.draft?.categoryId)) issues.push("产品系列无法映射");
    if (source?.confirmed !== true) issues.push("缺少人工确认");
    if (source?.categoryId !== p.draft?.categoryId) issues.push("产品系列尚未核实");
    if (!Object.hasOwn(types, source?.productType ?? "")) issues.push("产品类型尚未核实");
    const model = typeof source?.model === "string" ? source.model.trim() : "";
    if (!model) issues.push("缺少已确认的产品型号");
    if (!Object.hasOwn(ownershipCodes, source?.ownership ?? "")) issues.push("缺少已确认的产品属性");
    if (model) {
      const normalized = model.normalize("NFKC").toLocaleLowerCase();
      if (models.has(normalized)) issues.push(`产品型号与 ${models.get(normalized)} 重复`);
      else models.set(normalized, p.productId);
    }
    if (issues.length) problems.push({ oldProductId: p.productId, issues });
    else ready.push({ product: p, model, ownership: source.ownership, productType: source.productType });
  }
  // Allocate only when every input is complete: adding a missing earlier item must
  // never silently renumber already proposed mappings.
  if (problems.length) return { mode: "dry-run", ready: false, migrationExecutable: false, count: products.length, problems, mappings: [] };
  const occupied = new Set(occupiedIds);
  const counters = new Map();
  const mappings = ready.map(({ product, model, ownership, productType }) => {
    const prefix = `ZJ-${series[product.draft.categoryId]}-${types[productType]}-${ownershipCodes[ownership]}`;
    const next = (counters.get(prefix) ?? 0) + 1;
    if (next > 999) throw new Error(`目标编码序号超出三位范围：${prefix}`);
    counters.set(prefix, next);
    const newProductId = `${prefix}-${String(next).padStart(3, "0")}`;
    if (occupied.has(newProductId)) throw new Error(`目标编码冲突：${newProductId}`);
    occupied.add(newProductId);
    return { oldProductId: product.productId, newProductId, model, ownership, productType };
  });
  return { mode: "dry-run", ready: true, migrationExecutable: false, count: products.length, problems: [], mappings };
}

async function main() {
  const seed = JSON.parse(await readFile(new URL("../data/products.master.seed.json", import.meta.url), "utf8"));
  const expected = Array.from({ length: 27 }, (_, i) => `ZJ-${String(i + 1).padStart(3, "0")}`);
  if (seed.length !== expected.length || expected.some((id) => !seed.some((p) => p.productId === id)))
    throw new Error("原始 27 款产品清单不完整或编码不匹配");
  const args = process.argv.slice(2);
  if (args.length > 1) throw new Error("用法：node scripts/product-code-migration-preflight.mjs [确认数据 JSON 路径]");
  const input = args.length ? JSON.parse(await readFile(args[0], "utf8")) : {};
  const result = preflight(seed, input.confirmations ?? [], input.occupiedIds ?? [], {
    inventoryConfirmed: input.inventoryConfirmed === true && Array.isArray(input.occupiedIds),
    referencesConfirmed: input.referencesConfirmed === true,
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ready) process.exitCode = 2;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
