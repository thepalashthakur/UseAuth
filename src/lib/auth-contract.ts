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
}) {
  return {
    id: user.id,
    email: user.email,
    email_verified: Boolean(user.email_confirmed_at),
    created_at: user.created_at,
  };
}
