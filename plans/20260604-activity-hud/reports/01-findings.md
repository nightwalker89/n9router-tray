# Findings — Activity HUD (research consolidated)

**Date:** 2026-06-04 · No re-research needed; this captures confirmed facts.

## Data source (no backend change)
`api.getUsageStats(period)` — `src/api/client.js:107`, unauthenticated, `tauriFetch` (CORS-safe). Returns:
- `activeRequests[]`: `{model, provider, account, count}` — live in-flight (pulse).
- `recentRequests[]`: `{timestamp, model, provider, promptTokens, completionTokens, status, apiKey}` — provider PRESENT (n9router `usageDb.js`). `recentRequests[0].provider` = last provider.
- `byProvider{}`, `byModel{}` aggregates; `totalRequests/totalPromptTokens/totalCompletionTokens/totalCost`.
- `errorProvider`: provider that errored, auto-clears 10s → HUD error chip.

Real-time option (FUTURE): `GET http://localhost:20128/api/usage/stream` SSE, no auth, pushes same payload. Baseline = poll every ~2s.

## Reusable patterns
- Window: `open_terminal_window` (`src-tauri/src/lib.rs:811`) — `WebviewWindowBuilder` w/ label + `WebviewUrl::App("index.html#terminal")`.
- Routing: hash-based — `App.jsx:12` `const isTerminalWindow = window.location.hash === "#terminal"`. HUD → `#hud`.
- Tray menu: `MenuItemBuilder::with_id` + `MenuBuilder` + `on_menu_event` id-match (`lib.rs` setup).
- Store: `load("tray-settings.json", {autoSave:false})` (App.jsx, SettingsPanel).
- macOS `ActivationPolicy::Accessory` already set → aids non-focus-stealing HUD.
- Reuse `src/utils/format.js` (`formatTokens/shortModel/formatTime/formatCost`) + `src/App.css` theme vars.

## Resolved design decisions
- D1 auto-rotate: 4 tabs, ~7s advance, pause-on-hover, manual dots, Live sticky while in-flight, persistent header chip.
- D2 glossy: opaque glass-CSS baseline everywhere + native vibrancy (macOS NSVisualEffect, Win11 Mica/Acrylic); Win10 opaque (acrylic drag-lag). No hard translucency requirement.
- D3 data: `recentRequests[0].provider` + `errorProvider`; no n9router change.
- D4 trigger: tray menu item + persisted Settings toggle (show + show-on-start); persist visibility+position in store.

## Resolved (user decisions 2026-06-04)
- **Q1 windowEffects matrix — RESOLVED** (Tauri 2.x docs, `/websites/v2_tauri_app`):
  - `windowEffects` REQUIRES `transparent: true` window; unsupported on Linux.
  - **macOS:** `Effect::HudWindow` (10.14+), `state: FollowsWindowActiveState`, `radius` for rounded corners (fallback `Popover` 10.11+).
  - **Win11:** `Effect::Mica` (Win11-only) preferred; `Acrylic` exists but docs warn perf issues on resize/drag.
  - **Win10:** NO effect → transparent window + opaque glass CSS (avoids Acrylic drag-lag).
  - Applied in Rust at runtime via `WebviewWindowBuilder::effects(EffectsBuilder...)` (HUD is runtime-created, not in `tauri.conf.json` windows array), cfg-gated per OS.
- **Q2 macOSPrivateApi — RESOLVED: YES** set `app.macOSPrivateApi: true` (ship via DMG/npm; MAS not a goal).
- **Q3 position persistence — RESOLVED: store-based** (save x/y to `tray-settings.json` on move; no new dep).
- **Q4 drag region — RESOLVED: `data-tauri-drag-region`** on header (Tauri-native; add no-drag on interactive children).

## Unresolved questions
1. Win10 transparent + always-on-top z-order/artifact quirks — verify empirically in Phase 06 (not a decision; has opaque fallback).
