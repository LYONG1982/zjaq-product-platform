import { isIP } from "node:net";

/** MySQL 后端启动前的配置校验；缺失即拒绝启动，不回退任何内存实现。 */
export function requireMysqlConfiguration(env: NodeJS.ProcessEnv) {
  if (env.DATA_PROVIDER !== "mysql")
    throw new Error("REAL_API_REQUIRES_MYSQL: 仅接受 DATA_PROVIDER=mysql");
  for (const key of ["MYSQL_USER", "MYSQL_DATABASE", "ALLOWED_ORIGINS", "ALLOWED_HOSTS"])
    if (!env[key]?.trim()) throw new Error("MISSING_CONFIGURATION: " + key);
  const port = Number(env.API_PORT ?? 3101);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("INVALID_PORT");
  const mysqlPort = Number(env.MYSQL_PORT ?? 3306);
  if (!Number.isInteger(mysqlPort) || mysqlPort < 1 || mysqlPort > 65535)
    throw new Error("INVALID_PORT: MYSQL_PORT");
  if (
    env.TRUSTED_PROXY_ADDRESSES &&
    env.TRUSTED_PROXY_ADDRESSES.split(",").some((value) => !isIP(value.trim()))
  )
    throw new Error("INVALID_TRUSTED_PROXY_ADDRESS");
}
