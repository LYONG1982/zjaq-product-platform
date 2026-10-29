import test from "node:test";
import assert from "node:assert/strict";
import {
  ajv,
  compileSchema,
  validator,
  assertSchema,
} from "@zj/contracts/validation";
import {
  operations,
  operation,
  validateQuery,
} from "../../services/mock-api/src/contract";
import {
  templates,
  validateCreation,
  validateTemplateContent,
  queryTemplates,
} from "@zj/template-registry";
import { seedProducts } from "../../services/mock-api/src/seed";
const valid = {
  name: "虚构测试产品",
  categoryId: "miding",
  templateId: "software",
  templateVersion: 1,
  owner: "测试负责人",
  model: "MODEL-TEST", productType: "SOFTWARE", ownership: "SELF_DEVELOPED",
};
test("all declared operation JSON responses and write schemas compile as draft 2020-12", () => {
  assert.ok(operations.length >= 44);
  assert.ok(operations.some(op => op.operationId === "createAdminMediaSession"));
  for (const op of operations) {
    for (const response of Object.values(op.responses)) {
      const s = response.content?.["application/json"]?.schema;
      if (s) compileSchema(s);
    }
    const request = op.requestBody?.content["application/json"]?.schema;
    if (request) compileSchema(request);
  }
});
test("sales identity has its own response contract without widening admin identity", () => {
  const sales = {
    userId: "mock-sales",
    subjectId: "local-sales-only",
    displayName: "本地虚构销售身份",
    role: "SALES",
    enabled: true,
  };
  assert.equal(validator("response", "SalesIdentity")(sales), true);
  assert.equal(validator("response", "AdminIdentity")(sales), false);
});
test("client cannot choose product identifier or smuggle internal fields", () => {
  const fn = validator("domain", "CreateProduct");
  assert.equal(fn(valid), true);
  for (const bad of [
    { ...valid, productId: "ZJ-999" },
    { ...valid, publicationState: "PUBLISHED" },
    { ...valid, owner: "" },
  ])
    assert.equal(fn(bad), false);
});
test("PATCH allOf requires expectedVersion, create request does not", () => {
  for (const id of ["updateCategory", "updateAdminUser"]) {
    const schema =
      operation(id).requestBody!.content["application/json"].schema;
    const fn = compileSchema(schema);
    const body =
      id === "updateCategory"
        ? {
            name: "测试分类",
            shortName: "测试",
            sortOrder: 0,
            enabled: true,
            defaultTemplateId: "software",
            allowedTemplateIds: ["software"],
          }
        : {
            subjectId: "test-only",
            displayName: "测试",
            role: "ADMIN",
            enabled: true,
          };
    assert.equal(fn(body), false);
    assert.equal(
      fn({ ...body, expectedVersion: 1 }),
      true,
      ajv.errorsText(fn.errors),
    );
  }
});
test("three q queries enforce Unicode-aware 100 characters and strict limits", () => {
  for (const id of [
    "listPublicProducts",
    "listCurrentMaterials",
    "listAdminProducts",
  ]) {
    assert.equal(
      validateQuery(id, new URLSearchParams({ q: "中".repeat(100) })).q,
      "中".repeat(100),
    );
    assert.equal(
      validateQuery(id, new URLSearchParams({ q: "😀".repeat(100) })).q,
      "😀".repeat(100),
    );
    assert.throws(() =>
      validateQuery(id, new URLSearchParams({ q: "中".repeat(101) })),
    );
    assert.throws(() =>
      validateQuery(id, new URLSearchParams({ limit: "101" })),
    );
    assert.throws(() => validateQuery(id, new URLSearchParams("q=a&q=b")));
  }
});
test("classification and exact template versions are validated at creation", () => {
  assert.deepEqual(validateCreation(valid), []);
  for (const bad of [
    { ...valid, categoryId: "absent" },
    { ...valid, templateId: "ai" },
    { ...valid, templateVersion: 99 },
    { ...valid, owner: "  " },
  ])
    assert.ok(validateCreation(bad).length);
});
test("draft can be incomplete; publish-field checks remain strict", () => {
  const content = structuredClone(seedProducts[0].draft);
  assert.deepEqual(validateTemplateContent(content), []);
  assert.ok(
    validateTemplateContent(content, "publish-fields").some(
      (e) => e.path === "/technical/deployment",
    ),
  );
  assert.ok(
    validateTemplateContent({
      ...content,
      technical: { invented: "not part of template" },
    }).some((e) => e.path === "/technical/invented"),
  );
});
test("explicit old template version is readable even when disabled for creation", () => {
  const old = {
    ...structuredClone(templates.find((t) => t.id === "software")!),
    enabledForCreate: false,
  };
  const newVersion = {
    ...structuredClone(old),
    version: 2,
    enabledForCreate: true,
  };
  const fixture = [old, newVersion];
  assert.deepEqual(
    queryTemplates({}, fixture).map((t) => t.version),
    [2],
  );
  assert.deepEqual(
    queryTemplates({ templateId: "software", version: 1 }, fixture).map(
      (t) => t.version,
    ),
    [1],
  );
  assert.equal(queryTemplates({ includeDisabled: true }, fixture).length, 2);
  assert.equal(
    queryTemplates({ templateId: "software", version: 99 }, fixture).length,
    0,
  );
  assert.equal(
    validateQuery(
      "listTemplates",
      new URLSearchParams({ templateId: "software", version: "1" }),
    ).version,
    1,
  );
  assert.throws(() =>
    validateQuery("listTemplates", new URLSearchParams({ version: "0" })),
  );
  assert.throws(() =>
    validateQuery(
      "listTemplates",
      new URLSearchParams({ includeDisabled: "yes" }),
    ),
  );
});
test("public DTO whitelist rejects private fields", () => {
  const summary = {
    productId: "ZJ-999",
    releaseId: "test-only",
    releaseSequence: 1,
    publishedAt: "2026-01-01T00:00:00Z",
    name: "虚构",
    categoryId: "miding",
    categoryName: "测试",
    tagline: "测试",
    coverPath: null,
    pilotOrder: null,
  };
  assertSchema("response", "PublicProductSummary", summary);
  assert.throws(() =>
    assertSchema("response", "PublicProductSummary", {
      ...summary,
      owner: "private",
    }),
  );
});
