import type { Responses } from "@zj/contracts";
import { createHash } from "node:crypto";
import type { Repository, Transaction } from "./repository";
import { requireValue, AppError } from "../../domain/src/errors";
export const subjectKey = (subject: string) =>
  createHash("sha256").update(subject).digest("hex");
export interface IdentityProvider {
  subject(authorization: string | undefined): Promise<string>;
}
export async function identityFor(
  tx: Transaction,
  subject: string,
): Promise<Responses["AdminIdentity"] | Responses["SalesIdentity"]> {
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
  // Login identity stays minimal; username is only exposed through account management.
  const { version, username: _username, ...identity } = user;
  return user.role === "SALES"
    ? (identity as Responses["SalesIdentity"])
    : (identity as Responses["AdminIdentity"]);
}
export async function authenticate(
  repo: Repository,
  provider: IdentityProvider,
  header: string | undefined,
) {
  return identityFor(repo, await provider.subject(header));
}
export { AppError };
