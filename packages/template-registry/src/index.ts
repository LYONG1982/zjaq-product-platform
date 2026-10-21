import { readFileSync } from "node:fs";
import { assertSchema, validator, fieldErrors } from "@zj/contracts/validation";
import type { CreateProduct, DraftContent, Template } from "@zj/contracts";
import registry from "../../../templates/registry.json";
import categories from "../../../data/categories.seed.json";
export const templates: Template[] = registry.templates.map((entry) => {
  const value: Template = JSON.parse(
    readFileSync(
      new URL("../../../templates/" + entry.path, import.meta.url),
      "utf8",
    ),
  );
  assertSchema("response", "Template", value);
  if (value.id !== entry.id || value.version !== entry.version)
    throw new Error("Template registry mismatch");
  return value;
});
export type TemplateQuery = {
  templateId?: string;
  version?: number;
  includeDisabled?: boolean;
};
export function queryTemplates(
  query: TemplateQuery = {},
  source: Template[] = templates,
): Template[] {
  return source
    .filter(
      (t) =>
        (!query.templateId || t.id === query.templateId) &&
        (!query.version || t.version === query.version) &&
        (query.includeDisabled ||
          Boolean(query.templateId && query.version) ||
          t.enabledForCreate),
    )
    .sort((a, b) => a.id.localeCompare(b.id) || a.version - b.version)
    .map((t) => structuredClone(t));
}
export function validateCreation(value: unknown, categorySource = categories) {
  const check = validator("domain", "CreateProduct");
  if (!check(value)) return fieldErrors(check.errors);
  const v = value as CreateProduct;
  const errors: { path: string; message: string }[] = [];
  if (!v.name.trim()) errors.push({ path: "/name", message: "请填写产品名称" });
  if (!v.owner.trim()) errors.push({ path: "/owner", message: "请填写负责人" });
  const c = categorySource.find((c) => c.id === v.categoryId && c.enabled);
  const t = templates.find(
    (t) =>
      t.id === v.templateId &&
      t.version === v.templateVersion &&
      t.enabledForCreate,
  );
  if (!c) errors.push({ path: "/categoryId", message: "分类不可用于新建" });
  if (!t || !c?.allowedTemplateIds.includes(v.templateId))
    errors.push({
      path: "/templateId",
      message: "分类与模板不兼容，或模板版本不可用于新建",
    });
  return errors;
}
// Asset ownership and publication atomicity are enforced by the API store.
export function validateTemplateContent(
  content: DraftContent,
  mode: "draft" | "publish-fields" = "draft",
  source: Template[] = templates,
  categorySource = categories,
) {
  const check = validator("domain", "DraftContent");
  if (!check(content)) return fieldErrors(check.errors);
  const errors: { path: string; message: string }[] = [];
  const template = source.find(
    (t) => t.id === content.templateId && t.version === content.templateVersion,
  );
  if (!template)
    return [{ path: "/templateVersion", message: "模板版本不存在" }];
  const category = categorySource.find((c) => c.id === content.categoryId);
  if (!category?.allowedTemplateIds.includes(content.templateId))
    errors.push({ path: "/categoryId", message: "分类不兼容当前模板" });
  for (const [key, value] of Object.entries(content.technical)) {
    const field = template.fields.find((f) => f.key === key);
    if (!field)
      errors.push({
        path: "/technical/" + key,
        message: "字段不属于当前模板版本",
      });
    else if ([...value].length > field.maxLength)
      errors.push({ path: "/technical/" + key, message: "字段超过长度限制" });
  }
  if (mode === "publish-fields") {
    const record = content as unknown as Record<string, unknown>;
    for (const key of template.publishRequired) {
      const value = record[key];
      if (
        value === undefined ||
        (typeof value === "string" && !value.trim()) ||
        (Array.isArray(value) && value.length === 0)
      )
        errors.push({ path: "/" + key, message: "发布必填项尚未完成" });
    }
    for (const field of template.fields)
      if (field.requiredOnPublish && !content.technical[field.key]?.trim())
        errors.push({
          path: "/technical/" + field.key,
          message: field.label + "尚未填写",
        });
  }
  return errors;
}
