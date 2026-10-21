import { planSeed } from "../services/mock-api/src/seed";
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
