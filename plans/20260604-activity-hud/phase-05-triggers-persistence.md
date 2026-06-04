# Phase 05 — Triggers + persistence

## Context links
- Parent: [plan.md](plan.md) · Depends: Phase 01
- Reuse: tray menu (`src-tauri/src/lib.rs` setup), `SettingsPanel.jsx`, `tray-settings.json` store

## Overview
- **Date:** 2026-06-04
- **Description:** Decision D4. Open/close HUD via tray menu item + persisted Settings toggle; persist visibility + window position.
- **Priority:** P1 · **Impl status:** ⬜ Not started · **Review status:** ⬜ Pending

## Key insights
- Tray menu uses `MenuItemBuilder::with_id` + `on_menu_event` id-match — add `hud` id.
- Store file `tray-settings.json` already the settings home (App.jsx/SettingsPanel).
- macOS `ActivationPolicy::Accessory` already set → HUD shouldn't grab focus.

## Requirements
- **Tray menu** item "Activity HUD" → toggle hud window (show if hidden/absent, hide if visible).
- **Settings toggle** in `SettingsPanel.jsx`: "Show Activity HUD" (live toggle) + "Show on start" (persisted).
- Persist in store: `showHud` (bool), `showHudOnStart` (bool), `hudPos {x,y}`.
- On app launch: if `showHudOnStart` → open HUD.
- On HUD move: save `hudPos`; on open: restore (store-based; no new dep).
- On HUD close (user): set `showHud=false`.

## Architecture
- Rust: add `toggle_hud_window`/`close_hud_window` cmds (or extend `open_hud_window` w/ toggle); tray `on_menu_event` "hud" → toggle; read `showHudOnStart` in `.setup()` (or trigger from frontend main window on mount to keep store logic in JS).
- Frontend (main window): SettingsPanel rows write store + `invoke` open/close; restore-on-start handled in App.jsx main-window effect (simplest — keeps store reads in JS).
- Position: HUD listens to its own move event → debounce-save to store.

## Related code files
- `src-tauri/src/lib.rs` (tray item + toggle cmd) — **gitnexus_impact before edit**
- `src/panels/SettingsPanel.jsx` (two toggle rows)
- `src/App.jsx` (main-window: open-on-start if `showHudOnStart`)
- `src/panels/HudPanel.jsx` (save pos on move; close → set `showHud=false`)

## Implementation steps
1. `gitnexus_impact` on tray setup / `open_terminal_window` neighbors.
2. Rust `toggle_hud_window` + register; tray "Activity HUD" menu item + event.
3. SettingsPanel rows (reuse `SettingRow` component) wired to store.
4. App.jsx main-window mount: open HUD if `showHudOnStart`.
5. HUD: debounced move→store; close→`showHud=false`.
6. Manual test all toggle paths.

## Todo
- [ ] gitnexus_impact (tray/lib.rs)
- [ ] Rust toggle cmd + tray item
- [ ] Settings toggles (show / on-start)
- [ ] Open-on-start
- [ ] Position persist + restore

## Success criteria
- Tray item + Settings toggle both open/close HUD; "Show on start" persists across relaunch; HUD reopens at last position; closing HUD updates setting; no focus theft on macOS.

## Risk assessment
- Store read/write races between windows (Med) → single writer per key; debounce pos.
- Restored pos off-screen after monitor change (Low) → clamp to monitor (reuse positioner constrain).

## Security considerations
- Settings stored locally (no secrets). No new surface.

## Next steps
- → Phase 06 verification. Position = store-based in `tray-settings.json` (resolved, no new dep).
