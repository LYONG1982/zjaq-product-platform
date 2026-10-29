import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { requireValue } from "./errors";
const ttl = 5 * 60 * 1000;
/** Encrypted read-only cookie. Server enforces expiry on every media Range. */
export function mediaSessions(production: boolean, configured?: string) {
  const configuredKey = configured ? Buffer.from(configured, "base64") : undefined;
  if (configuredKey) requireValue(configuredKey.length === 32 && configuredKey.toString("base64") === configured, 500, "CONFIGURATION_ERROR", "ADMIN_MEDIA_SESSION_SECRET 必须是 32 字节 Base64 密钥");
  const key = configuredKey ?? (production ? undefined : randomBytes(32));
  return {
    issue(token: string) {
      requireValue(key,503,"CONFIGURATION_ERROR","媒体会话尚未配置，请联系管理员");
      const iv=randomBytes(12), cipher=createCipheriv("aes-256-gcm",key,iv);
      const encrypted=Buffer.concat([cipher.update(JSON.stringify({token,expires:Date.now()+ttl}),"utf8"),cipher.final()]);
      return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString("base64url");
    },
    read(value?: string) {
      if(!key || !value || value.length > 16384) return undefined;
      try {
        const bytes=Buffer.from(value,"base64url");
        const decipher=createDecipheriv("aes-256-gcm",key,bytes.subarray(0,12));decipher.setAuthTag(bytes.subarray(12,28));
        const record=JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString());
        if(typeof record.token !== "string" || !Number.isSafeInteger(record.expires) || record.expires <= Date.now() || record.expires > Date.now()+ttl) return undefined;
        return record.token as string;
      } catch { return undefined; }
    },
  };
}
