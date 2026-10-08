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
});
export const refresh = z
  .object({ refresh_token: z.string().min(1).max(4096) })
  .strict();
export const logout = refresh.extend({
  access_token: z.string().min(1).max(8192),
});
export const actions = [
  "sign-up",
  "sign-in",
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
