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

export function mobileAppUrl(platform: "ios" | "android") {
  const value =
    platform === "ios"
      ? process.env.IOS_APP_REDIRECT_URL
      : process.env.ANDROID_APP_REDIRECT_URL;
  if (!value) return null;
  try {
    const url = new URL(value);
    const scheme = url.protocol.slice(0, -1);
    if (
      (url.protocol !== "https:" && !/^[a-z][a-z0-9+.-]*$/.test(scheme)) ||
      ["http", "javascript", "data", "file", "blob", "ftp"].includes(scheme) ||
      url.username ||
      url.password ||
      url.hash
    )
      return null;
    return url;
  } catch {
    return null;
  }
}
