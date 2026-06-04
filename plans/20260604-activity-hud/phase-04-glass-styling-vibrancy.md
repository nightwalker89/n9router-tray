# Phase 04 — Glass styling + per-OS vibrancy

## Context links
- Parent: [plan.md](plan.md) · Depends: Phase 01 (window) — best after 03 for final polish

## Overview
- **Date:** 2026-06-04
- **Description:** Glossy look. Decision D2: opaque glass-CSS baseline everywhere, native vibrancy layered where supported.
- **Priority:** P1 · **Impl status:** ⬜ Not started · **Review status:** ⬜ Pending

## Key insights
- Translucency NOT uniformly available: Win10 acrylic has drag-lag bug → Win10 stays opaque.
- Baseline must look good fully opaque; vibrancy is enhancement only.
- **`windowEffects` REQUIRES `transparent: true` window (set in P01); unsupported on Linux.**
- **Pinned materials (Tauri 2.x, verified):** macOS `Effect::HudWindow` (state `FollowsWindowActiveState`, `radius` for rounded corners; fallback `Popover`); Win11 `Effect::Mica`; Win10 none (opaque CSS). Acrylic avoided (docs: perf issues on resize/drag).
- HUD window is runtime-created → apply effects in **Rust via `WebviewWindowBuilder::effects(EffectsBuilder...)`**, cfg-gated; NOT via `tauri.conf.json` windows array.

## Requirements
- **CSS baseline (all OS):** dark gradient bg, 1px hairline border, soft drop shadow, rounded corners, blur-friendly layering. Looks "glass" without OS translucency.
- **Native effects (runtime, cfg-gated, built-in — no extra crate):**
  - macOS: `Effect::HudWindow` + `EffectState::FollowsWindowActiveState` + `radius`.
  - Win11: `Effect::Mica`.
  - Win10: NO effect — opaque glass CSS fills the transparent window.
- Drag region: `data-tauri-drag-region` on header (no-drag on interactive children).

## Architecture
- Set effects on the `hud` window at creation in Rust (cfg-gated per OS) or via `tauri.conf.json` window `windowEffects`.
- HUD-scoped CSS class (e.g. `.hud-root`) so styles don't leak into main/terminal windows.
- When effects active, bg uses translucent layer; else opaque — driven by a body/root class set from platform detection (`@tauri-apps/plugin-os` or Rust-passed flag).

## Related code files
- `src-tauri/src/lib.rs` (window effects on hud build) — **gitnexus_impact before edit**
- `src-tauri/tauri.conf.json` (optional window `windowEffects`)
- `src/App.css` (`.hud-*` glass styles)

## Implementation steps
1. In `open_hud_window` builder, add cfg-gated `.effects(...)`: macOS `HudWindow`+`FollowsWindowActiveState`+radius; Win11 `Mica`; Win10 omit (detect Win11 via build/runtime version or just try Mica, which no-ops on Win10).
2. CSS `.hud-root` glass baseline (opaque-good) + translucent variant.
3. Platform flag (`@tauri-apps/plugin-os` or Rust-passed) → toggle translucent vs opaque class.
4. Add `data-tauri-drag-region` to header; no-drag on buttons/dots; verify move.
5. Visual pass each OS (full matrix in P06).

## Todo
- [x] Confirm Tauri windowEffects material matrix (done — findings Q1)
- [ ] Per-OS effects in builder (cfg-gated)
- [ ] Glass baseline CSS (opaque-good)
- [ ] Translucent/opaque class toggle
- [ ] Drag region

## Success criteria
- macOS shows vibrancy; Win11 Mica/Acrylic; Win10 clean opaque glass; baseline looks premium with effects off; no style leak to other windows; window draggable.

## Risk assessment
- Win10 acrylic lag (High) → no effect on Win10 (opaque CSS).
- Transparent z-order/shadow artifacts (Med) → verify P06.

## Security considerations
- None new.

## Next steps
- → Phase 05 triggers. All effects decisions resolved (findings Q1/Q2/Q4).
