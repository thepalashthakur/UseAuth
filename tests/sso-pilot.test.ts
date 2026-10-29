import { afterEach, expect, test, vi } from "vitest";
import { pilotClient, pilotRedirect } from "../src/lib/sso-pilot-config";

afterEach(() => vi.unstubAllEnvs());

test("resolves only exact configured clients and callbacks", () => {
  vi.stubEnv("SSO_MYHABITS_CLIENT_ID", "habits-client");
  vi.stubEnv("SSO_MYHABITS_REDIRECT_URI", "https://habits.example.com/auth/sso/callback");
  vi.stubEnv("SSO_TIMELOGGER_CLIENT_ID", "time-client");
  vi.stubEnv("SSO_TIMELOGGER_REDIRECT_URI", "https://time.example.com/auth/sso/callback");

  expect(pilotClient("habits-client")?.appKey).toBe("myhabits");
  expect(pilotClient("time-client")?.appKey).toBe("timelogger");
  expect(pilotClient("unknown")).toBeNull();
  expect(pilotRedirect("https://time.example.com/auth/sso/callback?code=abc&state=xyz")?.client.appKey).toBe("timelogger");
  expect(pilotRedirect("https://other.example.com/auth/sso/callback?code=abc")).toBeNull();
  expect(pilotRedirect("https://time.example.com/auth/sso/callback/extra?code=abc")).toBeNull();
});

test("rejects ambiguous client configuration", () => {
  vi.stubEnv("SSO_MYHABITS_CLIENT_ID", "shared-client");
  vi.stubEnv("SSO_MYHABITS_REDIRECT_URI", "https://habits.example.com/auth/sso/callback");
  vi.stubEnv("SSO_TIMELOGGER_CLIENT_ID", "shared-client");
  vi.stubEnv("SSO_TIMELOGGER_REDIRECT_URI", "https://time.example.com/auth/sso/callback");
  expect(pilotClient("shared-client")).toBeNull();
  expect(pilotRedirect("https://habits.example.com/auth/sso/callback?code=abc")).toBeNull();
});
