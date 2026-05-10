import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

const BASE_URL = "http://localhost:20128";

// Use Tauri's fetch (bypasses CORS) in production, browser fetch in dev
const doFetch = typeof window !== "undefined" && window.__TAURI_INTERNALS__
  ? tauriFetch
  : globalThis.fetch;

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

  // Usage
  getUsageStats: (period = "24h") => request("GET", `/api/usage/stats?period=${period}`),

  // Providers & Combos
  getProviders: () => request("GET", "/api/providers"),
  getProviderNodes: () => request("GET", "/api/provider-nodes"),
  getCombos: () => request("GET", "/api/combos"),
};
