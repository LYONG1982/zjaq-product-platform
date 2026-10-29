import { requireRealConfiguration } from "./config";
import { CloudBasePrivateStorage } from "./private-storage";
import { CloudBaseRepository } from "./repository";
import { CloudBaseIdentity } from "./auth";
import { CloudBackend } from "./cloud-backend";
import { verifyProductIndexes } from "./product-index-reconciliation";
import { makeApiServer } from "../../domain/src/http";
requireRealConfiguration(process.env);
const envId = process.env.CLOUDBASE_ENV_ID!;
const repo = new CloudBaseRepository(
  envId,
  process.env.CLOUDBASE_COLLECTION_PREFIX ?? "zj_",
);
const identity = new CloudBaseIdentity(
  envId,
  process.env.CLOUDBASE_AUTH_ORIGIN!,
);
const backend = new CloudBackend(repo, identity, new CloudBasePrivateStorage(repo.app));
const state = await repo.get<{ ready: boolean }>("control", "state");
if (!state?.ready) throw new Error("CLOUDBASE_NOT_INITIALIZED");
await verifyProductIndexes(repo);
const server = makeApiServer(backend, {
  trustedProxyAddresses: process.env.TRUSTED_PROXY_ADDRESSES?.split(",").map((value) => value.trim()).filter(Boolean),
  origins: process.env.ALLOWED_ORIGINS!.split(","),
  hosts: process.env.ALLOWED_HOSTS!.split(","),
});
server.listen(
  Number(process.env.API_PORT ?? 3101),
  process.env.API_BIND_HOST ?? "127.0.0.1",
  () =>
    console.log(
      JSON.stringify({ event: "api_started", provider: "cloudbase" }),
    ),
);
// Application cleanup also enforces retention when there are no dashboard reads.
const analyticsCleanup = setInterval(() => { void repo.pruneExpired("analytics", new Date()).catch(() => console.error(JSON.stringify({ event: "analytics_cleanup_failed" }))); }, 3600000);
analyticsCleanup.unref();
void repo.pruneExpired("analytics", new Date()).catch(() => console.error(JSON.stringify({ event: "analytics_cleanup_failed" })));
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => server.close(() => { void backend.files.close().finally(() => process.exit(0)); }));
