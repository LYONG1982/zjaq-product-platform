import { makeApiServer } from "../../services/domain/src/http";
import { TestStore } from "./store";
import { testBackend } from "./backend";
const list = (value?: string) =>
  value?.split(",").map((item) => item.trim()).filter(Boolean) || undefined;
/** 测试服务器：内存后端 + 回环白名单，非生产启动路径。 */
export function makeTestServer(
  env: NodeJS.ProcessEnv = process.env,
  store = new TestStore(undefined, env.ENABLE_MOCK_ROLES === "true"),
) {
  return makeApiServer(testBackend(store, env), {
    origins: list(env.ALLOWED_ORIGINS),
    hosts: list(env.ALLOWED_HOSTS),
    secureMediaCookie: false,
  });
}
