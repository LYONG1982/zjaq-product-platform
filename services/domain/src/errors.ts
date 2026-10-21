import { validator, fieldErrors } from "@zj/contracts/validation";
export type FieldError = { path: string; message: string };
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields: FieldError[] = [],
  ) {
    super(message);
  }
}
export function requireValue(
  condition: unknown,
  status: number,
  code: string,
  message: string,
): asserts condition {
  if (!condition) throw new AppError(status, code, message);
}
export function validateBody<T>(schema: string, value: unknown): T {
  const check = validator("domain", schema);
  if (!check(value))
    throw new AppError(
      400,
      "INVALID_ARGUMENT",
      "请求字段不符合接口要求",
      fieldErrors(check.errors),
    );
  return value as T;
}
export function invalidFields(fields: FieldError[]) {
  if (fields.length)
    throw new AppError(422, "VALIDATION_FAILED", "请检查以下内容", fields);
}
export const clone = <T>(value: T): T => structuredClone(value);
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
