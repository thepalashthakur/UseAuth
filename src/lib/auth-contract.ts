import { z } from "zod";

export const credentials = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((value) => value.trim().toLowerCase()),
    password: z.string().min(1).max(128),
  })
  .strict();
export const signup = credentials.extend({
  password: z.string().min(8, "Use at least 8 characters.").max(128),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .max(30)
    .refine(
      (value) => value === "" || /^[a-z0-9_]{3,30}$/.test(value),
      "Username must be 3–30 letters, numbers, or underscores.",
    )
    .transform((value) => value || undefined)
    .optional(),
  display_name: z
    .string()
    .trim()
    .max(80)
    .transform((value) => value || undefined)
    .optional(),
});
export const mobilePlatform = z.enum(["ios", "android"]);
export type MobilePlatform = z.infer<typeof mobilePlatform>;
export const tokenSignup = signup.extend({
  platform: mobilePlatform.optional(),
  app_id: z.string().regex(/^[a-z][a-z0-9_-]{2,63}$/).optional(),
});
export const refresh = z
  .object({ refresh_token: z.string().min(1).max(4096) })
  .strict();
export const logout = refresh.extend({
  access_token: z.string().min(1).max(8192),
});
export const forgotPassword = credentials.pick({ email: true }).extend({
  return_to: z.string().max(2048).optional(),
  app_id: z.string().regex(/^[a-z][a-z0-9_-]{2,63}$/).optional(),
});
export const resetPassword = z
  .object({
    password: z.string().min(8, "Use at least 8 characters.").max(128),
  })
  .strict();
export const changePassword = z
  .object({
    current_password: z.string().min(1).max(128),
    password: z.string().min(8, "Use at least 8 characters.").max(128),
  })
  .strict();
export const tokenPasswordChange = logout.extend({
  current_password: z.string().min(1).max(128),
  new_password: z.string().min(8, "Use at least 8 characters.").max(128),
  nonce: z.string().trim().min(1).max(20).optional(),
});
export const tokenProfileUpdate = logout.extend({
  display_name: z.string().trim().max(80),
});
export const actions = [
  "sign-up",
  "sign-in",
  "forgot-password",
  "reset-password",
  "change-password",
  "reauthenticate",
  "update-profile",
  "resend-confirmation",
  "refresh",
  "sign-out",
  "me",
] as const;
export type AuthAction = (typeof actions)[number];

export function allowedOrigin(
  origin: string | null,
  ownOrigin: string,
  configured: string | undefined,
) {
  if (!origin) return true; // Native and server clients do not use CORS.
  return (
    origin === ownOrigin ||
    (configured ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .includes(origin)
  );
}

export function recoveryReturnUrl(
  value: string | null | undefined,
  configured: string | undefined,
) {
  if (!value || value.length > 2048) return null;
  try {
    const url = new URL(value);
    const origins = (configured ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);
    if (
      !origins.includes(url.origin) ||
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      /[?&#]/.test(url.href)
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

export function publicUser(user: {
  id: string;
  email?: string;
  email_confirmed_at?: string;
  created_at: string;
  user_metadata?: Record<string, unknown>;
}) {
  const username = user.user_metadata?.username;
  const displayName = user.user_metadata?.display_name;
  return {
    id: user.id,
    email: user.email,
    email_verified: Boolean(user.email_confirmed_at),
    created_at: user.created_at,
    username: typeof username === "string" ? username : null,
    display_name: typeof displayName === "string" ? displayName : null,
  };
}
