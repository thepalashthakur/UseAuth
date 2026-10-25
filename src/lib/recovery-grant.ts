import { createHmac, timingSafeEqual } from "node:crypto";

export const recoveryCookie = "useauth-recovery";
const lifetimeMs = 10 * 60 * 1000;

export function recoveryConfigured() {
  return /^[0-9a-f]{64,}$/.test(process.env.RECOVERY_GRANT_SECRET ?? "");
}

function signature(accessToken: string, userId: string, expires: number) {
  const secret = process.env.RECOVERY_GRANT_SECRET;
  if (!secret || !recoveryConfigured())
    throw new Error(
      "RECOVERY_GRANT_SECRET must be at least 32 random bytes in hex.",
    );
  return createHmac("sha256", Buffer.from(secret, "hex"))
    .update(`password-recovery:${accessToken}:${userId}:${expires}`)
    .digest("hex");
}

export function createRecoveryGrant(accessToken: string, userId: string) {
  const expires = Date.now() + lifetimeMs;
  return `${expires}.${signature(accessToken, userId, expires)}`;
}

export function validRecoveryGrant(
  grant: string | undefined,
  accessToken: string,
  userId: string,
) {
  if (!grant) return false;
  const match = grant.match(/^(\d{13})\.([0-9a-f]{64})$/);
  if (!match) return false;
  const expires = Number(match[1]);
  if (expires < Date.now() || expires > Date.now() + lifetimeMs) return false;
  const expected = Buffer.from(signature(accessToken, userId, expires), "hex");
  const actual = Buffer.from(match[2], "hex");
  return timingSafeEqual(actual, expected);
}
