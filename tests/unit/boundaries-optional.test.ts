import test from "node:test";
import assert from "node:assert/strict";
import { templates, validateTemplateContent } from "@zj/template-registry";
import { seedProducts } from "../../services/mock-api/src/seed";

test("boundaries remain in draft content but are optional for publication", () => {
  for (const template of templates) {
    assert.ok(
      !template.publishRequired.includes("boundaries"),
      `${template.id} must not require boundaries for publication`,
    );
    const record = seedProducts.find(
      (product) => product.draft.templateId === template.id,
    );
    assert.ok(record, `expected a compatible seed for ${template.id}`);

    const content = structuredClone(record.draft);
    const existingValue = content.boundaries;
    content.boundaries = "";
    const errors = validateTemplateContent(content, "publish-fields");
    assert.ok(
      !errors.some((error) => error.path === "/boundaries"),
      `${template.id} should allow an empty boundaries field`,
    );

    content.boundaries = existingValue;
    assert.equal(content.boundaries, existingValue);
    assert.deepEqual(validateTemplateContent(content), []);
  }
});
