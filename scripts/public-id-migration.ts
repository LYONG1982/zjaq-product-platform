import { readFile, writeFile } from "node:fs/promises";
import { createPublicIdPlan } from "../services/api/src/public-id-migration";
import { validateBackup } from "../services/api/src/backup-validation";
import { parseOfflinePublicIdArguments } from "../services/api/src/operations-arguments";
import type { ProductRecord } from "@zj/contracts";

const { backupPath, output } = parseOfflinePublicIdArguments(process.argv.slice(2));
const backup = validateBackup(JSON.parse(await readFile(backupPath, "utf8")));
const masters = backup.records.products.map(({ _id, ...record }) => record as Omit<ProductRecord, "draft">);
const plan = createPublicIdPlan(masters, backup.revision);
await writeFile(output, JSON.stringify(plan, null, 2), { flag: "wx", mode: 0o600 });
console.log(JSON.stringify({ cloudConnected: false, mode: "offline-plan", products: plan.entries.length, missing: plan.entries.filter(entry => !entry.previousPublicId).length, planWritten: true }));
