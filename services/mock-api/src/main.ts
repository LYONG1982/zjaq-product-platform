import { makeMockServer } from "./server";
const port = Number(process.env.API_PORT ?? 3100);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Invalid API_PORT");
const server = makeMockServer();
server.listen(port, "127.0.0.1", () =>
  console.log(
    "Local Mock API: http://127.0.0.1:" +
      port +
      " (TASK-02/03, session memory only)",
  ),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => server.close(() => process.exit(0)));
