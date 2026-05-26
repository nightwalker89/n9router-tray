# n9router-tray Feature Plan

## Overview

Six phases to complete the n9router-tray macOS app: login auto-start, n9router auto-start verification, kill-port-before-start, universal DMG build, GitHub Actions release, and CLI npm package.

## Phases

| # | Phase | Status | Complexity |
|---|-------|--------|------------|
| 1 | Auto-start tray on macOS login | pending | medium |
| 2 | Auto-start n9router on tray launch | pending | low |
| 3 | Kill port 20128 before starting n9router | pending | medium |
| 4 | macOS universal DMG build | pending | low |
| 5 | GitHub Actions release workflow | pending | medium |
| 6 | n9tray CLI npm package | pending | high |

## Key Files

- `src-tauri/Cargo.toml` — Rust dependencies
- `src-tauri/src/lib.rs` — Tauri commands and plugin registration
- `src/panels/SettingsPanel.jsx` — Settings UI
- `src/hooks/useAutoStart.js` — Auto-start hook (already implemented)
- `src/App.jsx` — Main app entry
- `package.json` — Scripts and deps
- `.github/workflows/release.yml` — CI (to create)

## Dependencies Between Phases

- Phase 2 depends on Phase 1 (login start must exist before auto-start logic is verified)
- Phase 3 is independent
- Phase 5 depends on Phase 4 (workflow uses the build script)
- Phase 6 depends on Phase 5 (CLI distributes the built artifact)

## Architecture Notes

- Tauri 2.x with React 18 frontend, Vite bundler
- macOS-only (min 13.0), tray-icon app with Accessory activation policy
- State persisted via `tauri-plugin-store` in `tray-settings.json`
- n9router process managed via Rust commands (spawn, kill, lsof port detection)
- No `tauri-plugin-autostart` yet — must be added for Phase 1
