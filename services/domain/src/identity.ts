import { AsyncLocalStorage } from "node:async_hooks";
import type { Responses } from "@zj/contracts";
export const identity: Responses["AdminIdentity"] = {
  userId: "mock-content-manager",
  subjectId: "local-development-only",
  displayName: "开发演示制作人",
  role: "CONTENT_MANAGER",
  enabled: true,
};
export const salesIdentity: Responses["SalesIdentity"] = {
  userId: "mock-sales",
  subjectId: "local-sales-only",
  displayName: "本地虚构销售身份",
  role: "SALES",
  enabled: true,
};
export type AuthenticatedIdentity =
  | Responses["AdminIdentity"]
  | Responses["SalesIdentity"];
export const actorContext = new AsyncLocalStorage<AuthenticatedIdentity>();
export const actor = () => actorContext.getStore() ?? identity;
