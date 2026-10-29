import type { Domain } from "@zj/contracts";
import { requireValue, validateBody } from "./errors";
export function validateFeedback(body: unknown): Domain["FeedbackSubmit"] {
  const value = validateBody<Domain["FeedbackSubmit"]>("FeedbackSubmit", body);
  value.content = value.content.trim(); value.contact = value.contact.trim();
  requireValue(value.content.length > 0, 422, "VALIDATION_FAILED", "请填写建议内容");
  return value;
}
