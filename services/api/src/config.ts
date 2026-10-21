export function requireRealConfiguration(env: NodeJS.ProcessEnv) {
  if (env.DATA_PROVIDER !== "cloudbase")
    throw new Error("REAL_API_REQUIRES_CLOUDBASE: Mock fallback is forbidden");
  for (const key of [
    "CLOUDBASE_ENV_ID",
    "ADMIN_IDENTITY_PROVIDER",
    "ADMIN_BOOTSTRAP_SUBJECT_ID",
    "CLOUDBASE_AUTH_ORIGIN",
    "ALLOWED_ORIGINS",
    "ALLOWED_HOSTS",
  ])
    if (!env[key]?.trim()) throw new Error("MISSING_CONFIGURATION: " + key);
  if (!/^[a-zA-Z0-9_-]+$/.test(env.CLOUDBASE_ENV_ID!))
    throw new Error("INVALID_ENVIRONMENT_ID");
  const port = Number(env.API_PORT ?? 3101);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("INVALID_PORT");
  if (env.ADMIN_IDENTITY_PROVIDER !== "cloudbase")
    throw new Error("UNSUPPORTED_IDENTITY_PROVIDER");
}
export function guardMockEnvironment(env: NodeJS.ProcessEnv) {
  const appEnv = env.APP_ENV ?? "development";
  if (
    !["development", "test"].includes(appEnv) ||
    env.NODE_ENV === "production" ||
    (env.DATA_PROVIDER ?? "mock") !== "mock"
  )
    throw new Error("MOCK_FORBIDDEN: development/test only");
}
