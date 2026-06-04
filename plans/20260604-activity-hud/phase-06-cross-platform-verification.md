# Phase 06 — Cross-platform verification

## Context links
- Parent: [plan.md](plan.md) · Depends: Phases 02–05

## Overview
- **Date:** 2026-06-04
- **Description:** Manual verification matrix across macOS, Win11, Win10 + pre-commit gitnexus check. No new code (fixes only).
- **Priority:** P0 (gate to ship) · **Impl status:** ⬜ Not started · **Review status:** ⬜ Pending

## Key insights
- Transparent + always-on-top + frameless behave differently per OS; Win10 is the risk.
- CLAUDE.md: `gitnexus_detect_changes()` before commit.

## Requirements
Verify on each OS: window appearance, vibrancy/opaque correctness, rotation/hover, triggers, persistence, idle CPU, offline state.

## Test matrix
| Check | macOS | Win11 | Win10 |
|-------|-------|-------|-------|
| Window frameless/on-top/no-taskbar | ☐ | ☐ | ☐ |
| Glass: vibrancy / vibrancy / opaque | ☐ | ☐ | ☐ |
| No focus theft on open | ☐ | ☐ | ☐ |
| Drag to move + persist pos | ☐ | ☐ | ☐ |
| Auto-rotate + hover-pause + sticky-Live | ☐ | ☐ | ☐ |
| Live/Recent data ≤3s; provider+model+tokens | ☐ | ☐ | ☐ |
| Error chip on `errorProvider` | ☐ | ☐ | ☐ |
| Tray item + Settings toggle open/close | ☐ | ☐ | ☐ |
| Show-on-start persists across relaunch | ☐ | ☐ | ☐ |
| Offline state (n9router stopped) dim, no spam | ☐ | ☐ | ☐ |
| Idle CPU ~0 when hidden (no polling) | ☐ | ☐ | ☐ |
| Open <300ms; re-open focuses, no dup | ☐ | ☐ | ☐ |

## Implementation steps
1. Build/run per OS (`npm run tauri:dev`; Win via `tauri:build:windows`).
2. Walk matrix; log defects.
3. Fix Win10 transparency/z-order artifacts (fallback opaque if needed).
4. `gitnexus_detect_changes()` — confirm only expected symbols/flows touched.
5. Final review sign-off.

## Todo
- [ ] macOS pass
- [ ] Win11 pass
- [ ] Win10 pass (transparency fallback if needed)
- [ ] gitnexus_detect_changes clean
- [ ] Defects fixed/retested

## Success criteria
- All matrix cells pass (Win10 opaque acceptable); idle CPU ~0 hidden; gitnexus scope clean; no regressions to main/terminal windows.

## Risk assessment
- Win10 transparent artifacts (High) → opaque fallback ready.
- Always-on-top covering other apps annoyance (Med) → easy hide via tray/Settings; revisit if reported.

## Security considerations
- Confirm no PII leak (emails) per "Mask Emails" setting in HUD rows.

## Next steps
- Merge → tag → release (existing `release.yml` builds mac+win). Future: SSE real-time upgrade (`/api/usage/stream`).
