# Phase 7: Frontend Cosmetic + Cross-Platform Verification

## Context Links
- Parent: `plan.md` · Depends on: Phase 1-6
- Scout: `scout/platform-touchpoints.md` (frontend is platform-agnostic)
- Files: `src/panels/SettingsPanel.jsx`, `src/App.css` (comments), verification across all

## Overview
Date: 2026-05-30 · Priority: low · Status: pending

Genericize macOS-specific UI copy and run full cross-platform verification. The frontend needs only cosmetic edits because it drives the HTTP API + stable `invoke` commands; all real OS work is in `platform/`.

## Key Insights
- `SettingsPanel.jsx:285-286` "Start this tray app when you log in to macOS" → OS-neutral.
- Transparent undecorated popup may need an opaque fallback on Windows (decide after first Windows render).
- No `invoke` command shape changed → MitmPanel / TerminalPanel untouched.

## Requirements
### Functional
1. "Launch at Login" description OS-neutral (e.g. "Start this tray app when you sign in").
2. (Conditional) opaque background fallback if transparent popup glitches on Windows.
### Non-functional
3. macOS UI visually unchanged.
4. Full feature parity verified on Windows (best-effort per OS limits).

## Verification Matrix
| Feature | macOS (regress) | Windows (new) |
|---------|-----------------|---------------|
| Build | DMG via `tauri:build:macos-universal` | NSIS+MSI via `tauri:build:windows` |
| Tray icon + popup toggle | template icon | colored icon, near taskbar |
| n9router start/stop/status | lsof/kill | netstat/taskkill |
| Managed log ring buffer | pipe stdout | pipe stdout (CREATE_NO_WINDOW) |
| External log tail (`log.txt`) | `$HOME` | `%USERPROFILE%` |
| Focus Terminal | osascript | Win32 SetForegroundWindow |
| AGY list/launch/restart/quit | .app/setsid/kill | .exe/creation_flags/taskkill /T |
| AGY v1/v2/IDE detection | asar/bin probe | exe/asar probe |
| Auto-start at login | LaunchAgent | registry Run key |
| Auto-start n9router + kill-port | works | works |
| CLI install+launch | DMG/open -a | setup.exe/spawn |

## Implementation Steps
1. Edit SettingsPanel copy (OS-neutral).
2. (If needed post-build) add opaque-bg fallback for Windows popup.
3. macOS regression: `npm run tauri:build` → run app → exercise matrix.
4. Windows: build via CI artifact or local → install → exercise matrix.
5. `cargo clippy` both targets (catch cfg dead-code).
6. Clean up temp files.
7. Write `walkthrough.md` (changes, screenshots, validation).

## Todo
- [ ] SettingsPanel copy OS-neutral
- [ ] Windows popup render acceptable (or opaque fallback)
- [ ] macOS full regression pass
- [ ] Windows full feature pass
- [ ] clippy clean both OSes
- [ ] walkthrough.md written

## Success Criteria
- macOS: zero visible regression.
- Windows: tray, n9router control, AGY control, focus, autostart, CLI all functional (focus may degrade to taskbar-flash; documented).

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| No local Windows machine for test | Med | High | Use CI build + user (owns Windows) manual test |
| Transparent popup glitch | Med | Low | Opaque fallback |
| AGY paths wrong on user's machine | Med | High | Confirm via plan-questions Q1 before final sign-off |
| Backend (n9router) Windows MITM gaps | Med | Med | Out of scope — tray-side parity only; flag to user |

## Security Considerations
- No new attack surface from cosmetic edits.
- Verification confirms no secrets logged in debug.log / log tail.

## Next Steps
On approval + Q1 confirmation, execute Phases 1→7 in order (see plan.md). DO NOT IMPLEMENT until approved.
