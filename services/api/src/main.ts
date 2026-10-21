import { requireRealConfiguration } from "./config";
import { CloudBaseRepository } from "./repository";
import { CloudBaseIdentity } from "./auth";
import { CloudBackend } from "./cloud-backend";
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
const backend = new CloudBackend(repo, identity, {
  async upload(path, bytes) {
    const r = await repo.app.uploadFile({
      cloudPath: path,
      fileContent: bytes,
    });
    if (!r.fileID) throw new Error("PRIVATE_UPLOAD_FAILED");
    return r.fileID;
  },
  async download(fileId, path) {
    await repo.app.downloadFile({ fileID: fileId, tempFilePath: path });
  },
});
const state = await repo.get<{ ready: boolean }>("control", "state");
if (!state?.ready) throw new Error("CLOUDBASE_NOT_INITIALIZED");
const server = makeApiServer(backend, {
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
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => server.close(() => process.exit(0)));
