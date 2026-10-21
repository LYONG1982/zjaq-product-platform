import type { Responses } from "@zj/contracts";
import { createHash } from "node:crypto";
import type { Repository, Transaction } from "./repository";
import { requireValue, AppError } from "../../domain/src/errors";
export const subjectKey = (subject: string) =>
  createHash("sha256").update(subject).digest("hex");
export interface IdentityProvider {
  subject(authorization: string | undefined): Promise<string>;
}
export class CloudBaseIdentity implements IdentityProvider {
  constructor(
    private envId: string,
    private origin: string,
  ) {
    const u = new URL(origin);
    requireValue(
      u.protocol === "https:" &&
        u.hostname === envId + ".api.tcloudbasegateway.com" &&
        u.pathname === "/" &&
        !u.search &&
        !u.username &&
        !u.password,
      500,
      "CONFIGURATION_ERROR",
      "身份服务需使用对应环境的官方 HTTPS 地址",
    );
  }
  async subject(header: string | undefined) {
    requireValue(
      header &&
        /^Bearer [A-Za-z0-9._~+\/-]+=*$/.test(header) &&
        header.length < 8192 &&
        !header.includes("local-mock") &&
        !header.includes("local-admin"),
      401,
      "SESSION_EXPIRED",
      "请重新登录",
    );
    let response;
    try {
      response = await fetch(
        this.origin.replace(/\/$/, "") + "/auth/v1/token/introspect",
        {
          headers: { Authorization: header },
          redirect: "error",
          cache: "no-store",
          signal: AbortSignal.timeout(10000),
        },
      );
    } catch {
      throw new AppError(
        503,
        "IDENTITY_UNAVAILABLE",
        "身份服务暂不可用，请重试",
      );
    }
    requireValue(response.ok, 401, "SESSION_EXPIRED", "登录已失效，请重新登录");
    const data = (await response.json()) as {
      sub?: string;
      client_id?: string;
      token_type?: string;
    };
    requireValue(
      data.token_type === "Bearer" &&
        data.client_id === this.envId &&
        typeof data.sub === "string" &&
        data.sub.length > 0,
      401,
      "SESSION_EXPIRED",
      "登录已失效，请重新登录",
    );
    return data.sub;
  }
}
export async function identityFor(
  tx: Transaction,
  subject: string,
): Promise<Responses["AdminIdentity"]> {
  const index = await tx.get<{ userId: string }>(
    "subjects",
    subjectKey(subject),
  );
  const user = index
    ? await tx.get<Responses["AdminUser"]>("users", index.userId)
    : undefined;
  requireValue(
    user?.enabled && user.subjectId === subject,
    403,
    "FORBIDDEN",
    "此身份未获后台访问权限",
  );
  const { version, ...identity } = user;
  return identity;
}
export async function authenticate(
  repo: Repository,
  provider: IdentityProvider,
  header: string | undefined,
) {
  return identityFor(repo, await provider.subject(header));
}
