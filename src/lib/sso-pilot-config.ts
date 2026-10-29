type PilotClient = { id: string; callback: string; appKey: "myhabits" | "timelogger" };

function configuredClients(): PilotClient[] {
  const settings = [
    { id: process.env.SSO_MYHABITS_CLIENT_ID, callback: process.env.SSO_MYHABITS_REDIRECT_URI, appKey: "myhabits" as const },
    { id: process.env.SSO_TIMELOGGER_CLIENT_ID, callback: process.env.SSO_TIMELOGGER_REDIRECT_URI, appKey: "timelogger" as const },
  ];
  const clients: PilotClient[] = [];
  for (const setting of settings) {
    if (!setting.id || !setting.callback) continue;
    try {
      const url = new URL(setting.callback);
      if (url.protocol !== "https:" || url.username || url.password || url.hash || url.search || url.pathname !== "/auth/sso/callback") continue;
      clients.push({ id: setting.id, callback: url.href, appKey: setting.appKey });
    } catch { /* Ignore an invalid pilot configuration. */ }
  }
  if (new Set(clients.map(client => client.id)).size !== clients.length ||
      new Set(clients.map(client => client.callback)).size !== clients.length) return [];
  return clients;
}

export function pilotClient(clientId: string) {
  return configuredClients().find(client => client.id === clientId) ?? null;
}

export function pilotRedirect(value: string) {
  for (const client of configuredClients()) {
    const url = safeOAuthRedirect(value, client.callback);
    if (url) return { client, url };
  }
  return null;
}

export function safeOAuthRedirect(value: string, callback: string) {
  try {
    const url = new URL(value);
    const expected = new URL(callback);
    if (url.origin !== expected.origin || url.pathname !== expected.pathname || url.hash || url.username || url.password) return null;
    if (url.searchParams.has("code") === url.searchParams.has("error")) return null;
    return url;
  } catch {
    return null;
  }
}
