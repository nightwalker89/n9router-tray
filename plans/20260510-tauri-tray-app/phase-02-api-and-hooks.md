# Phase 2: API Client & Polling Hooks

> Parent: [plan.md](./plan.md) | Depends on: Phase 1 | Priority: P0 | Status: TODO

## Overview

Build the API client layer and React hooks that poll n9router's REST APIs. This is the data backbone for all 3 panels.

## Key Insights

- All APIs are on `localhost:20128` (configurable)
- No auth needed for local dashboard APIs (only `/v1/*` routes enforce API key)
- Tray popup shows/hides frequently → polling is simpler than SSE
- Poll intervals: 5s for MITM status, 10s for usage, 30s for providers
- Pause polling when popup is hidden to save resources

## Requirements

### Functional
- [ ] API client with base URL configuration
- [ ] Health check: detect if n9router server is running
- [ ] `useMitmStatus()` hook — polls MITM status every 5s
- [ ] `useUsageStats()` hook — polls usage stats every 10s
- [ ] `useProviders()` hook — polls providers/combos every 30s
- [ ] Auto-pause polling when window is hidden
- [ ] Error state handling (server offline)

### Non-functional
- Minimal re-renders (memoize responses)
- No external state library (React state + context sufficient)

## Architecture

### API Client (`src/api/client.js`)
```javascript
const BASE_URL = "http://localhost:20128";

export async function apiGet(path) {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export async function apiPost(path, body) { ... }
export async function apiPatch(path, body) { ... }
export async function apiDelete(path, body) { ... }
```

### Polling Hook Pattern (`src/hooks/usePolling.js`)
```javascript
// Generic polling hook — pauses when document is hidden
function usePolling(fetcher, intervalMs) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    let active = true;
    const poll = async () => {
      if (document.hidden) return;
      try { setData(await fetcher()); setError(null); }
      catch (e) { setError(e); }
    };
    poll();
    const id = setInterval(poll, intervalMs);
    return () => { active = false; clearInterval(id); };
  }, []);
  
  return { data, error, refetch: () => fetcher().then(setData) };
}
```

### Specific Hooks

| Hook | Endpoint | Interval | Returns |
|------|----------|----------|---------|
| `useMitmStatus` | `GET /api/cli-tools/antigravity-mitm` | 5s | `{ running, pid, certExists, certTrusted, dnsStatus, hasCachedPassword }` |
| `useUsageStats` | `GET /api/usage/stats?period=24h` | 10s | `{ totalRequests, totalPromptTokens, totalCompletionTokens, totalCost, activeRequests, recentRequests, byModel }` |
| `useProviders` | `GET /api/providers` + `GET /api/combos` | 30s | `{ providers: [...], combos: [...] }` |
| `useServerHealth` | `GET /api/health` | 10s | `{ online: boolean }` |

### MITM Action Functions (not hooks — imperative)
```javascript
export async function startMitm(apiKey, sudoPassword) {
  return apiPost("/api/cli-tools/antigravity-mitm", { apiKey, sudoPassword });
}
export async function stopMitm(sudoPassword) {
  return apiDelete("/api/cli-tools/antigravity-mitm", { sudoPassword });
}
export async function toggleToolDNS(tool, action, sudoPassword) {
  return apiPatch("/api/cli-tools/antigravity-mitm", { tool, action, sudoPassword });
}
```

## Related Files (in n9router)

| n9router File | Provides |
|---------------|----------|
| `src/app/api/cli-tools/antigravity-mitm/route.js` | MITM GET/POST/DELETE/PATCH |
| `src/app/api/usage/stats/route.js` | Usage stats endpoint |
| `src/app/api/providers/route.js` | Provider connections |
| `src/app/api/combos/route.js` | Model combos |
| `src/app/api/health/route.js` | Health check |

## Implementation Steps

1. Create `src/api/client.js` — fetch wrapper with error handling
2. Create `src/hooks/usePolling.js` — generic polling hook with visibility pause
3. Create `src/hooks/useMitmStatus.js` — MITM status hook
4. Create `src/hooks/useUsageStats.js` — usage stats hook
5. Create `src/hooks/useProviders.js` — providers + combos hook
6. Create `src/hooks/useServerHealth.js` — online/offline detection
7. Create `src/api/mitmActions.js` — imperative start/stop/toggle functions
8. Wire hooks into App.jsx to verify data flows

## Todo

- [ ] Create `src/api/client.js`
- [ ] Create `src/hooks/usePolling.js`
- [ ] Create `src/hooks/useMitmStatus.js`
- [ ] Create `src/hooks/useUsageStats.js`
- [ ] Create `src/hooks/useProviders.js`
- [ ] Create `src/hooks/useServerHealth.js`
- [ ] Create `src/api/mitmActions.js`
- [ ] Test: verify hooks return data when n9router is running
- [ ] Test: verify polling pauses when popup hidden

## Success Criteria

- All hooks return correct data from n9router
- Polling pauses when popup is hidden
- Server offline → error state rendered
- MITM actions (start/stop/toggle) work

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| CORS in Tauri production | Medium | High | Use `tauri-plugin-http` or CSP config |
| n9router not running | Expected | Medium | "Server Offline" state in UI |
