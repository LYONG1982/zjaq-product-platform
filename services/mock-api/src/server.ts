import { makeApiServer } from "../../domain/src/http";
import { MockStore } from "./store";
import { mockBackend } from "./backend";
import { guardMockEnvironment } from "../../api/src/config";
export function makeMockServer(
  env: NodeJS.ProcessEnv = process.env,
  store = new MockStore(undefined, env.ENABLE_MOCK_ROLES === "true"),
) {
  guardMockEnvironment(env);
  return makeApiServer(mockBackend(store, env));
}
