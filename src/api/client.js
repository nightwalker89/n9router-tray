import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

const BASE_URL = "http://localhost:20128";

// Use Tauri's fetch (bypasses CORS) in production, browser fetch in dev
const doFetch = typeof window !== "undefined" && window.__TAURI_INTERNALS__
  ? tauriFetch
  : globalThis.fetch;

// ── Auth token management ─────────────────────────────────────────────────

let authToken = null;

async function ensureAuth() {
  if (authToken) return authToken;
  // Login with default password (INITIAL_PASSWORD)
  try {
    const res = await doFetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "123456" }),
    });
    if (!res.ok) throw new Error("Auth failed");
    // Extract auth_token from set-cookie header
    const setCookie = res.headers.get("set-cookie") || "";
    const match = setCookie.match(/auth_token=([^;]+)/);
    if (match) {
      authToken = match[1];
    }
    return authToken;
  } catch {
    return null;
  }
}

// ── Request helpers ───────────────────────────────────────────────────────

async function request(method, path, body) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await doFetch(`${BASE_URL}${path}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/** Authenticated request — auto-logins and sends auth cookie */
async function authRequest(method, path, body) {
  const token = await ensureAuth();
  const opts = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Cookie: `auth_token=${token}` } : {}),
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await doFetch(`${BASE_URL}${path}`, opts);
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    // Token expired — retry once
    authToken = null;
    const newToken = await ensureAuth();
    if (newToken) {
      opts.headers.Cookie = `auth_token=${newToken}`;
      const retry = await doFetch(`${BASE_URL}${path}`, opts);
      const retryData = await retry.json().catch(() => ({}));
      if (!retry.ok) throw new Error(retryData.error || `HTTP ${retry.status}`);
      return retryData;
    }
    throw new Error("Authentication failed");
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  // Health
  health: () => request("GET", "/api/health"),

  // MITM
  getMitmStatus: () => request("GET", "/api/cli-tools/antigravity-mitm"),
  startMitm: (apiKey, sudoPassword) =>
    request("POST", "/api/cli-tools/antigravity-mitm", { apiKey, sudoPassword }),
  stopMitm: (sudoPassword) =>
    request("DELETE", "/api/cli-tools/antigravity-mitm", { sudoPassword }),
  toggleDNS: (tool, action, sudoPassword) =>
    request("PATCH", "/api/cli-tools/antigravity-mitm", { tool, action, sudoPassword }),

  // Settings (auth required)
  getSettings: () => authRequest("GET", "/api/settings"),
  updateSettings: (body) => authRequest("PATCH", "/api/settings", body),

  // Usage
  getUsageStats: (period = "24h") => request("GET", `/api/usage/stats?period=${period}`),

  // Providers & Combos
  getProviders: () => request("GET", "/api/providers").then(d => d.connections ?? d),
  getProviderNodes: () => request("GET", "/api/provider-nodes").then(d => d.nodes ?? d),
  getCombos: () => request("GET", "/api/combos").then(d => d.combos ?? d),
  toggleConnection: (id, isActive) => request("PUT", `/api/providers/${id}`, { isActive }),
  testConnection: (id) => request("POST", `/api/providers/${id}/test`),
  getAccountQuota: (id) => request("GET", `/api/usage/${id}`),
  getAccountHealth: () => request("GET", "/api/internal/account-health").then(d => d.accounts ?? {}),
};
