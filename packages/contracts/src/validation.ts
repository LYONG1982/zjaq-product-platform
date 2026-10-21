import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import domain from "../../../contracts/domain.schema.json";
import responses from "../../../contracts/response.schema.json";
import type { ErrorObject, ValidateFunction, AnySchema } from "ajv";
export const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  strictRequired: false,
});
// required inside an allOf branch is allowed; validation still enforces it.
addFormats(ajv);
ajv.addSchema(domain);
ajv.addSchema(responses);
const cache = new Map<string, ValidateFunction>();
export function validator(
  document: "domain" | "response",
  name: string,
): ValidateFunction {
  const ref = document + ".schema.json#/$defs/" + name;
  let fn = cache.get(ref);
  if (!fn) {
    fn = ajv.compile({ $ref: ref });
    cache.set(ref, fn);
  }
  return fn;
}
export function assertSchema(
  document: "domain" | "response",
  name: string,
  value: unknown,
): void {
  const fn = validator(document, name);
  if (!fn(value)) throw new Error(name + ": " + ajv.errorsText(fn.errors));
}
export function compileSchema(schema: AnySchema) {
  return ajv.compile(schema);
}
export function fieldErrors(errors: ErrorObject[] | null | undefined) {
  return (errors ?? []).map((e) => ({
    path: e.instancePath || "/",
    message: e.message ?? "字段无效",
  }));
}
export { domain, responses };
export { Ajv2020 };
export type { AnySchema, ValidateFunction } from "ajv";
