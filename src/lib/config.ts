export function isConfigured() {
  return Boolean(
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_PUBLISHABLE_KEY &&
    !process.env.SUPABASE_URL.includes("your-project") &&
    !process.env.SUPABASE_PUBLISHABLE_KEY.includes("your-key"),
  );
}

export function supabaseConfig() {
  if (!isConfigured()) throw new Error("Supabase is not configured.");
  return {
    url: process.env.SUPABASE_URL!,
    key: process.env.SUPABASE_PUBLISHABLE_KEY!,
  };
}

export function appOrigin() {
  const value = process.env.APP_URL;
  if (!value) throw new Error("APP_URL is not configured.");
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new Error("APP_URL must be an HTTP origin.");
  return url.origin;
}
