import { fileURLToPath } from "node:url";
import { checkVideoRuntimeAtStartup } from "../../domain/src/video-probe.mjs";
import { requireMysqlConfiguration } from "./config";
import { LocalPrivateStorage } from "./local-private-storage";
import { createMysqlPool, migrate, mysqlConfig, MysqlRepository } from "./mysql-repository";
import { MysqlAuthStore, MysqlIdentity, login } from "./mysql-auth";
import { identityFor } from "./auth";
import { DomainBackend } from "./domain-backend";
import { verifyProductIndexes } from "./product-index-reconciliation";
import { makeApiServer } from "../../domain/src/http";

requireMysqlConfiguration(process.env);
const pool = createMysqlPool(mysqlConfig(process.env));
await migrate(pool, fileURLToPath(new URL("../migrations/", import.meta.url)));
const repo = new MysqlRepository(pool);
const authStore = new MysqlAuthStore(pool);
const backend = new DomainBackend(
  repo,
  new MysqlIdentity(authStore),
  new LocalPrivateStorage(process.env.ZJ_STORAGE_DIR),
  authStore,
);
const state = await repo.get<{ ready: boolean }>("control", "state");
if (!state?.ready) throw new Error("NOT_INITIALIZED: 请先执行 pnpm db:init");
await verifyProductIndexes(repo);
await checkVideoRuntimeAtStartup();
const server = makeApiServer(backend, {
  trustedProxyAddresses: process.env.TRUSTED_PROXY_ADDRESSES?.split(",").map((value) => value.trim()).filter(Boolean),
  origins: process.env.ALLOWED_ORIGINS!.split(","),
  hosts: process.env.ALLOWED_HOSTS!.split(","),
  secureMediaCookie: process.env.NODE_ENV === "production",
  auth: {
    login: async (body, ip) => {
      await backend.throttle(ip);
      const result = await login(authStore, (subject) => identityFor(repo, subject), body);
      return { token: result.token, expiresAt: result.expiresAt };
    },
    logout: (header) => authStore.deleteSession(header),
  },
});
server.listen(
  Number(process.env.API_PORT ?? 3101),
  process.env.API_BIND_HOST ?? "127.0.0.1",
  () => console.log(JSON.stringify({ event: "api_started", provider: "mysql" })),
);
const analyticsCleanup = setInterval(() => {
  void repo.pruneExpired("analytics", new Date()).catch(() => console.error(JSON.stringify({ event: "analytics_cleanup_failed" })));
}, 3600000);
analyticsCleanup.unref();
void repo.pruneExpired("analytics", new Date()).catch(() => console.error(JSON.stringify({ event: "analytics_cleanup_failed" })));
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => server.close(() => { void backend.files.close().finally(() => { void repo.close().finally(() => process.exit(0)); }); }));
