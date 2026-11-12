import { planSeed } from "../services/domain/src/seed-products";
const plan = planSeed([]);
console.log(
  JSON.stringify(
    {
      mode: "dry-run",
      environment: "development",
      insertIds: plan.insert.map((p) => p.productId),
      counterNext: plan.counterNext,
      skipped: plan.skipped,
    },
    null,
    2,
  ),
);
