import { randomBytes, scrypt, timingSafeEqual, createHash, type ScryptOptions } from "node:crypto";
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { Responses } from "@zj/contracts";
import { AppError } from "../../domain/src/errors";
import type { IdentityProvider } from "./auth";

const derive = (password: string, salt: Buffer, keylen: number, options?: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, keylen, options ?? {}, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
const KEY_LENGTH = 64;
const SESSION_MS = 8 * 60 * 60 * 1000;
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function hashPassword(password: string) {
  if (password.length < 8 || password.length > 128)
    throw new AppError(400, "INVALID_ARGUMENT", "密码长度需为 8 到 128 位");
  const salt = randomBytes(16);
  const key = (await derive(password, salt, KEY_LENGTH)) as Buffer;
  return `scrypt$16384,8,1$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

async function verifyPassword(password: string, stored: string) {
  const [scheme, params, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !params || !salt || !hash) return false;
  const [n, r, p] = params.split(",").map(Number);
  const expected = Buffer.from(hash, "base64url");
  const actual = (await derive(password, Buffer.from(salt, "base64url"), expected.length, {
    N: n,
    r,
    p,
    maxmem: 64 * 1024 * 1024,
  })) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export class MysqlAuthStore {
  constructor(readonly pool: Pool) {}

  async findUser(username: string) {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT user_id, username, password_hash FROM auth_users WHERE username = ? AND password_hash IS NOT NULL",
      [username],
    );
    return rows[0] ?? undefined;
  }

  async userIdFor(username: string) {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT user_id FROM auth_users WHERE username = ?",
      [username],
    );
    return rows.length ? String(rows[0].user_id) : undefined;
  }

  async usernameOf(userId: string) {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT username FROM auth_users WHERE user_id = ?",
      [userId],
    );
    return rows.length ? String(rows[0].username) : undefined;
  }

  async deleteUser(userId: string) {
    await this.pool.query("DELETE FROM auth_sessions WHERE user_id = ?", [userId]);
    await this.pool.query("DELETE FROM auth_users WHERE user_id = ?", [userId]);
  }

  async createUser(userId: string, username: string, password: string) {
    const now = new Date();
    await this.pool.query(
      "INSERT INTO auth_users (user_id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      [userId, username, await hashPassword(password), now, now],
    );
  }

  async updatePassword(userId: string, password: string) {
    await this.pool.query("UPDATE auth_users SET password_hash = ?, updated_at = ? WHERE user_id = ?", [
      await hashPassword(password),
      new Date(),
      userId,
    ]);
  }

  async createSession(userId: string) {
    const token = randomBytes(32).toString("base64url");
    const now = Date.now();
    await this.pool.query("DELETE FROM auth_sessions WHERE expires_at <= ?", [now]);
    await this.pool.query(
      "INSERT INTO auth_sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
      [tokenHash(token), userId, now + SESSION_MS, now],
    );
    return { token, expiresAt: new Date(now + SESSION_MS) };
  }

  async sessionUserId(header: string | undefined) {
    const match = /^Bearer ([A-Za-z0-9_-]{20,64})$/.exec(header ?? "");
    if (!match) return undefined;
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT user_id, expires_at FROM auth_sessions WHERE token_hash = ?",
      [tokenHash(match[1])],
    );
    const row = rows[0];
    return row && Number(row.expires_at) > Date.now() ? String(row.user_id) : undefined;
  }

  async deleteSession(header: string | undefined) {
    const match = /^Bearer ([A-Za-z0-9_-]{20,64})$/.exec(header ?? "");
    if (match) await this.pool.query("DELETE FROM auth_sessions WHERE token_hash = ?", [tokenHash(match[1])]);
  }

  async deleteSessionsOf(userId: string) {
    await this.pool.query("DELETE FROM auth_sessions WHERE user_id = ?", [userId]);
  }
}

/** 把会话 token 转成白名单里使用的 subject。 */
export class MysqlIdentity implements IdentityProvider {
  constructor(readonly store: MysqlAuthStore) {}
  async subject(header: string | undefined) {
    const userId = await this.store.sessionUserId(header);
    if (!userId) throw new AppError(401, "SESSION_EXPIRED", "登录已失效，请重新登录");
    return `mysql:${userId}`;
  }
}

export type LoginResult = { token: string; expiresAt: Date; identity: Responses["AdminIdentity"] | Responses["SalesIdentity"] };

export async function login(
  store: MysqlAuthStore,
  identityFor: (subject: string) => Promise<Responses["AdminIdentity"] | Responses["SalesIdentity"]>,
  body: unknown,
): Promise<LoginResult> {
  const record = (body ?? {}) as { username?: unknown; password?: unknown };
  if (typeof record.username !== "string" || typeof record.password !== "string")
    throw new AppError(400, "INVALID_ARGUMENT", "请输入账号与密码");
  const username = record.username.trim();
  const user = await store.findUser(username);
  const passwordOk = user ? await verifyPassword(record.password, String(user.password_hash)) : false;
  if (!user || !passwordOk) throw new AppError(401, "INVALID_CREDENTIALS", "账号或密码不正确");
  const identity = await identityFor(`mysql:${user.user_id}`);
  const session = await store.createSession(String(user.user_id));
  return { token: session.token, expiresAt: session.expiresAt, identity };
}
