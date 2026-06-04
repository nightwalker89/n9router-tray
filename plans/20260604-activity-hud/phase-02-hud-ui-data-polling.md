# Phase 02 — HUD UI + data + polling

## Context links
- Parent: [plan.md](plan.md) · Findings: [reports/01-findings.md](reports/01-findings.md) · Depends: Phase 01
- Reuse: `src/panels/UsagePanel.jsx` (data shape ref), `src/utils/format.js`, `src/api/client.js`

## Overview
- **Date:** 2026-06-04
- **Description:** Fill `HudPanel` with the 4 content views fed by `getUsageStats`; poll every ~2s only while visible; graceful offline state.
- **Priority:** P0 · **Impl status:** ⬜ Not started · **Review status:** ⬜ Pending

## Key insights
- No new API — `api.getUsageStats("24h")` already returns everything (see findings).
- `recentRequests[0].provider` = last provider; `errorProvider` = error chip.
- Pause polling on hidden window → idle CPU ~0.

## Requirements
- Four views (data only this phase; rotation in P03):
  - **Live**: `activeRequests[]` rows (model · provider·account · ×count, pulse dot).
  - **Recent**: last ~6 `recentRequests` (time · model · provider · `p→c` tokens · status ✓/✗).
  - **Providers**: top `byProvider` (req + tokens).
  - **Models**: top `byModel` bars.
- Token-usage summary line (total tokens) reused across views.
- Offline state: dim "n9router offline", no error spam/log flooding.

## Architecture
- `usePolling`-style effect (reuse `src/hooks/usePolling.js` if compatible) at 2–2.5s; clear on unmount.
- Lifecycle: listen `document.visibilitychange` + Tauri window hide/show → stop/start interval. Single in-flight fetch guard.
- Pure presentational subcomponents; reuse `formatTokens/shortModel/formatTime`.

## Related code files
- `src/panels/HudPanel.jsx` (build out)
- `src/hooks/usePolling.js` (reuse/extend) · `src/api/client.js` (no change) · `src/utils/format.js` (no change)

## Implementation steps
1. Fetch `getUsageStats("24h")` on mount + interval 2.5s; store `{stats,error,loading}`.
2. Pause/resume interval on visibility/window-hide.
3. Render 4 view components from stats slices (cap list lengths for tiny window).
4. Offline/empty states (dim, single message).
5. Verify live update as requests flow through n9router.

## Todo
- [ ] Polling hook w/ visibility pause
- [ ] Live / Recent / Providers / Models views
- [ ] Offline + empty states
- [ ] Manual: values update ≤3s

## Success criteria
- All 4 views render real data; updates within one interval; no error spam offline; no fetch when hidden (verify via network/log).

## Risk assessment
- Over-frequent polling load (Low, localhost) → 2.5s + hidden-pause.
- Tiny window overflow/clipping (Med) → strict row caps + ellipsis (final polish P04).

## Security considerations
- Unauthenticated localhost endpoint only; mask emails if `account` shows PII (respect existing "Mask Emails" setting — reuse logic).

## Next steps
- → Phase 03 rotation + header. Open Q: does `usePolling` support dynamic pause, or add a lightweight local interval?
