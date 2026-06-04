# Phase 01 — Window + hash-routing skeleton

## Context links
- Parent: [plan.md](plan.md) · Findings: [reports/01-findings.md](reports/01-findings.md)
- Clones: `src-tauri/src/lib.rs:811` (`open_terminal_window`), `src/App.jsx:12` (hash routing)

## Overview
- **Date:** 2026-06-04
- **Description:** Spawn a frameless/transparent/always-on-top `hud` WebviewWindow at `#hud`; mount a stub `HudPanel`. No data/styling yet — prove the window + routing.
- **Priority:** P0 (foundation) · **Impl status:** ⬜ Not started · **Review status:** ⬜ Pending

## Key insights
- Hash routing already used for terminal window — mirror, don't reinvent.
- Transparent macOS window needs `app.macOSPrivateApi: true` in `tauri.conf.json`.
- `WebviewUrl::App("index.html#hud")`.

## Requirements
- New Rust command `open_hud_window(app)` registered in `invoke_handler`.
- `App.jsx` routes `#hud` → `<HudPanel/>` (bare placeholder).
- Window: 280×360, `decorations(false)`, `transparent(true)`, `always_on_top(true)`, `resizable(false)`, `skip_taskbar(true)`, positioned top-right (positioner) — non-activating where possible.

## Architecture
- Add command beside `open_terminal_window`; reuse get-or-create idempotency (`get_webview_window("hud")` → show+focus else build).
- Frontend: add `const isHudWindow = window.location.hash === "#hud"` and early-return `<HudPanel/>` (skip StatusBar/tabs/polling of main app).

## Related code files
- `src-tauri/src/lib.rs` (NEW cmd + handler entry) — **gitnexus_impact REQUIRED before edit**
- `src-tauri/tauri.conf.json` (`app.macOSPrivateApi: true`)
- `src/App.jsx` (hash branch) · `src/panels/HudPanel.jsx` (NEW stub)

## Implementation steps
1. `gitnexus_impact({target:"open_terminal_window", direction:"upstream"})`; report blast radius.
2. Add `open_hud_window` Rust cmd (mirror terminal builder w/ HUD flags); register in `generate_handler!`.
3. `tauri.conf.json`: set `app.macOSPrivateApi: true`.
4. `src/panels/HudPanel.jsx`: stub returning a visible box "HUD".
5. `App.jsx`: detect `#hud`, render `HudPanel` early.
6. Temp-invoke `open_hud_window` (e.g. from a dev button or tray) to verify.

## Todo
- [ ] gitnexus_impact on open_terminal_window
- [ ] Rust open_hud_window + handler
- [ ] macOSPrivateApi flag
- [ ] HudPanel stub + #hud route
- [ ] Manual: window appears frameless/on-top

## Success criteria
- Invoking `open_hud_window` shows a frameless, always-on-top 280×360 window rendering the stub; re-invoke focuses existing (no dup). `npm run tauri:dev` builds clean.

## Risk assessment
- Transparent window black/opaque if `macOSPrivateApi` missing (Med) → set flag.
- Win10 frameless + transparent may show artifacts (Med) → addressed in P04/P06.

## Security considerations
- New window loads same local bundle; no new network surface. No secrets.

## Next steps
- → Phase 02 (UI + data). Drag = `data-tauri-drag-region` (resolved); `transparent: true` set here is prerequisite for P04 effects.
