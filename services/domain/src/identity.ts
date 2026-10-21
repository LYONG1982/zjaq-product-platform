import { AsyncLocalStorage } from "node:async_hooks";
import type { Responses } from "@zj/contracts";
export const identity: Responses["AdminIdentity"] = {
  userId: "mock-content-manager",
  subjectId: "local-development-only",
  displayName: "开发演示制作人",
  role: "CONTENT_MANAGER",
  enabled: true,
};
export const actorContext = new AsyncLocalStorage<Responses["AdminIdentity"]>();
export const actor = () => actorContext.getStore() ?? identity;
