import { createHmac, createHash, timingSafeEqual } from "node:crypto";

type Purpose = "confirmation" | "recovery";
const lifetime: Record<Purpose, number> = {
  confirmation: 24 * 60 * 60 * 1000,
  recovery: 60 * 60 * 1000,
};

function key() {
  const secret = process.env.RECOVERY_GRANT_SECRET;
  if (!secret || !/^[0-9a-f]{64,}$/.test(secret))
    throw new Error("RECOVERY_GRANT_SECRET is not configured.");
  return Buffer.from(secret, "hex");
}

function emailDigest(email: string) {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

export function createAppReturn(
  appId: string,
  origin: string,
  email: string,
  purpose: Purpose,
) {
  const payload = Buffer.from(JSON.stringify({
    appId,
    origin,
    emailHash: emailDigest(email),
    purpose,
    expires: Date.now() + lifetime[purpose],
  })).toString("base64url");
  const signature = createHmac("sha256", key())
    .update(`app-return-v1:${payload}`)
    .digest("base64url");
  return `${payload}.${signature}`;
}

export function readAppReturn(
  value: string | null | undefined,
  email: string,
  purpose: Purpose,
): { appId: string; origin: string } | null {
  if (!value || value.length > 1024) return null;
  const parts = value.split(".");
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return null;
  try {
    const expected = createHmac("sha256", key())
      .update(`app-return-v1:${parts[0]}`)
      .digest();
    const actual = Buffer.from(parts[1], "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const data: unknown = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    if (!data || typeof data !== "object") return null;
    const p = data as Record<string, unknown>;
    if (
      p.purpose !== purpose ||
      p.emailHash !== emailDigest(email) ||
      typeof p.appId !== "string" || !/^[a-z][a-z0-9_-]{2,63}$/.test(p.appId) ||
      typeof p.origin !== "string" ||
      !/^https:\/\/[a-z0-9.-]+(?::[0-9]+)?$/.test(p.origin) ||
      typeof p.expires !== "number" ||
      p.expires < Date.now() || p.expires > Date.now() + lifetime[purpose]
    ) return null;
    return { appId: p.appId, origin: p.origin };
  } catch {
    return null;
  }
}

export async function registeredAppOrigin(
  client: { rpc: (name: string, args: { app_key: string }) => PromiseLike<{ data: unknown; error: unknown }> },
  appId: string,
) {
  const { data, error } = await client.rpc("auth_app_return_origin", { app_key: appId });
  return !error && typeof data === "string" && /^https:\/\/[a-z0-9.-]+(?::[0-9]+)?$/.test(data)
    ? data
    : null;
}
