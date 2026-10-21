import { readFileSync } from "node:fs";
import { parse } from "yaml";
import {
  Ajv2020,
  ajv,
  compileSchema,
  type AnySchema,
  type ValidateFunction,
} from "@zj/contracts/validation";
type Parameter = {
  name: string;
  in: string;
  required?: boolean;
  schema: Record<string, unknown>;
};
type Operation = {
  operationId: string;
  parameters?: Parameter[];
  responses: Record<
    string,
    { content?: Record<string, { schema: AnySchema }> }
  >;
  requestBody?: { content: Record<string, { schema: AnySchema }> };
};
export const specification = parse(
  readFileSync(
    new URL("../../../contracts/api-contract.yaml", import.meta.url),
    "utf8",
  ),
) as { paths: Record<string, Record<string, Operation>> };
export const operations = Object.values(specification.paths).flatMap(
  (methods) =>
    Object.entries(methods)
      .filter(([m]) => ["get", "post", "patch", "put", "delete"].includes(m))
      .map(([, op]) => op),
);
const queryAjv = new Ajv2020({
  coerceTypes: true,
  allErrors: true,
  strict: true,
});
const queryValidators = new Map<string, ValidateFunction>();
export function operation(id: string) {
  const op = operations.find((o) => o.operationId === id);
  if (!op) throw new Error("Unknown operation " + id);
  return op;
}
export function validateQuery(
  id: string,
  params: URLSearchParams,
): Record<string, string | number | boolean> {
  const op = operation(id);
  let fn = queryValidators.get(id);
  if (!fn) {
    const fields = (op.parameters ?? []).filter((p) => p.in === "query");
    fn = queryAjv.compile({
      type: "object",
      properties: Object.fromEntries(fields.map((p) => [p.name, p.schema])),
      required: fields.filter((p) => p.required).map((p) => p.name),
      additionalProperties: false,
    });
    queryValidators.set(id, fn);
  }
  const values: Record<string, string | number | boolean> = {};
  for (const [key, value] of params) {
    if (Object.hasOwn(values, key)) throw new Error("不允许重复查询参数");
    values[key] = value;
  }
  if (!fn(values)) throw new Error(queryAjv.errorsText(fn.errors));
  return values;
}
const responseChecks = new Map<string, ValidateFunction>();
export function checkResponse(id: string, body: unknown) {
  let fn = responseChecks.get(id);
  if (!fn) {
    const schema =
      operation(id).responses["200"].content?.["application/json"]?.schema;
    if (!schema) throw new Error("Missing response schema");
    fn = compileSchema(schema);
    responseChecks.set(id, fn);
  }
  if (!fn(body))
    throw new Error("Response contract: " + ajv.errorsText(fn.errors));
}
