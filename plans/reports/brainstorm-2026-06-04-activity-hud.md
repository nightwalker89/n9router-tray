# Brainstorm — Live Activity HUD (floating widget)

**Date:** 2026-06-04
**Topic:** New feature — small always-on-top floating panel showing live routing activity
**Status:** Brainstorm complete, recommended design proposed (not implemented)
**Audience:** Public (shipping to strangers) · **Appetite:** Medium feature

---

## 1. Problem statement

n9router-tray is today a **passive control surface**: you open the tray popover, read state, flip switches. The live "what is my proxy doing right now" view is buried in the Usage panel, which only exists while the popover is open.

User want: a **small, glossy, always-on-top floating HUD** that is glanceable without opening the tray — showing recent activity (requests), recently-used provider + model, token usage, with auto-rotating tabs.

### Requirements (as stated)
- Floating small panel (separate window, always-on-top)
- Recent activities stream
- Recently-used provider + model
- Token usage
- Auto-rotate tabs
- Glossy / translucent design
- Public-grade polish (Windows + macOS)

---

## 2. Feasibility finding (the important part)

**The data already exists. This is ~90% a frontend + window feature.**

`api.getUsageStats(period)` (`src/api/client.js:107`, unauthenticated, already polled by `UsagePanel`) returns:

| Field | Shape | Feeds HUD section |
|-------|-------|-------------------|
| `activeRequests[]` | `{model, provider, account, count}` | "Live" pulsing in-flight view |
| `recentRequests[]` | `{timestamp, model, promptTokens, completionTokens, status}` | "Recent" activity stream |
| `byProvider` | `{name: {requests, promptTokens, completionTokens, totalCost}}` | "Top / recent provider" |
| `byModel` | `{name: {requests, rawModel, totalCost}}` | "Top model" |
| `totalRequests`, `totalPromptTokens`, `totalCompletionTokens`, `totalCost` | scalars | Token-usage summary |

Window mechanics are **already a solved pattern**: `open_terminal_window` (`src-tauri/src/lib.rs`) spawns a separate floating `WebviewWindow` for the logs terminal. `tauri-plugin-positioner` and `tauri-plugin-store` are already dependencies. Format helpers (`formatTokens`, `shortModel`, `formatTime`) already exist.

**Net:** no new data pipeline, no fragile log-parsing, no new plugins. Reuse, reuse, reuse (DRY).

### The one real unknown
The current `Recent` list (`UsagePanel.jsx:177`) renders model/tokens/status but **NOT provider** — so it is unconfirmed whether `recentRequests` items carry a `provider`/`account` field. "Recently-used provider" may need to be:
- (a) read from `recentRequests[i].provider` if it exists (verify in n9router), or
- (b) derived from `activeRequests` / `byProvider` (always available), or
- (c) a small n9router-side enhancement to include provider on `recentRequests`.

**Action:** verify `recentRequests` shape against the n9router repo before locking the "recent provider" UI. This is the only thing between the spec and a pure-frontend build.

---

## 3. Recommended design

### 3.1 Window architecture (KISS — clone the terminal-window pattern)
- New frameless, transparent, always-on-top, non-activating `WebviewWindow` labelled `hud`.
- Add `open_hud_window` Tauri command modeled on `open_terminal_window`.
- Route the same Vite bundle by window label / query param (whatever `open_terminal_window` already does) — **single bundle, no second HTML entry**.
- Position: anchor top-right via `tauri-plugin-positioner`; draggable; persist last position + on/off in `tauri-plugin-store`.
- Small fixed footprint (~280×360). Interactive (not click-through) since user clicks tabs/dots.

### 3.2 Content layout (4 tabs, glanceable)
- **Live** — `activeRequests` with pulse dots (sticky: never auto-rotate away while a request is in-flight).
- **Recent** — last ~6 `recentRequests`: time · model · `prompt→completion` tokens · status.
- **Providers** — top `byProvider` rows (request count + tokens).
- **Models** — top `byModel` bars.
- Persistent header strip (always visible regardless of tab): last provider+model chip + rolling token total.

### 3.3 Auto-rotate (constrained — see Decision D1)
- Auto-advance tabs every ~7s.
- **Pause-on-hover; resume on mouse-leave.**
- Manual dots/click to jump; manual interaction pauses auto until idle.
- "Live" tab is sticky while `activeRequests.length > 0`.

### 3.4 Glossy look (glass-first, vibrancy-as-enhancement — see Decision D2)
- Base CSS: dark gradient + hairline 1px border + soft drop shadow + rounded corners → looks "glossy" with **zero** OS translucency. This is the guaranteed-everywhere baseline.
- Enhancement layer (feature-detected):
  - **macOS:** native `NSVisualEffect` vibrancy (`hudWindow`/`popover` material) via Tauri `windowEffects`.
  - **Windows 11:** Mica / Acrylic via `windowEffects`.
  - **Windows 10:** ship opaque glass baseline (skip acrylic — known drag-lag bug). Do NOT make translucency a hard requirement.
- Reuse existing CSS variables / theme tokens (DRY with the main panel).

### 3.5 Polling & lifecycle (public-grade reliability)
- Poll `getUsageStats` every ~2–3s **only while HUD is visible & focused-region**; pause on `visibilitychange` / window hide (avoid idle CPU). Localhost so cost trivial, but discipline matters for a shipped widget.
- n9router offline → dim "offline" state, not error spam.
- Click HUD body → focus/open main tray for full detail (HUD stays "now", main panel owns depth).

---

## 4. Approaches evaluated

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **A. Separate always-on-top WebviewWindow** (recommended) | Reuses terminal-window pattern, true floating widget, independent of popover | +1 webview process (~memory), second poll loop | ✅ Chosen — matches the spec ("floating") and existing precedent |
| B. Extra "compact" mode inside existing popover | Zero new window, simplest | Not floating/always-on-top — fails the core requirement | ❌ Doesn't meet spec |
| C. Native tray-icon animation / menubar title text | Ultra-glanceable, no window | Tiny info budget, no "tabs/glossy", platform-divergent | ❌ Too small for the ask (note as future enhancement) |
| D. OS notifications for activity | Reuses notification infra | Spammy for per-request stream; not a persistent HUD | ❌ Wrong tool (good for *alerts*, not a live feed) |

---

## 5. Open decisions (need user reaction)

- **D1 — Auto-rotate behaviour.** Recommend constrained auto-rotate (pause-on-hover, sticky-Live, manual override) rather than naive timed carousel. _Confirm acceptable._
- **D2 — Glossy fallback policy.** Recommend "glass-CSS baseline everywhere + native vibrancy where supported; opaque on Win10." _Confirm we won't hard-require translucency._
- **D3 — Recent-provider data source.** Pending verification of `recentRequests` shape in n9router (carries provider? if not, derive from `byProvider`/`activeRequests` or add server field).
- **D4 — Open trigger.** Tray menu item "Activity HUD" + a Settings toggle "Show HUD" (persisted). _Confirm both vs. one._

---

## 6. Risks & mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Glossy inconsistent / Win10 acrylic lag | High (public, cross-platform) | Glass-CSS baseline; vibrancy only where supported; opaque Win10 |
| Auto-rotate annoyance | Medium | Pause-on-hover, manual control, sticky-Live |
| `recentRequests` lacks `provider` | Medium | Verify n9router; fallback to `byProvider`/`activeRequests` |
| Always-on-top steals focus | Medium | Non-activating / accessory window flags |
| Extra webview memory / double polling | Low | Pause polling when hidden; localhost cost negligible |
| Scope creep (charts, history, drill-down) | Medium | YAGNI guardrails (§7) |

---

## 7. Scope guardrails (YAGNI)

In-scope: floating window, 4 glanceable tabs, constrained auto-rotate, glass styling, persisted position/visibility.
**Out-of-scope (resist):** new charts/graphs, historical scrubbing, per-request drill-down, cost forecasting, configurable layouts. HUD is **"now"**; the main panel owns depth.

---

## 8. Success metrics / validation

- HUD opens < ~300ms; updates within one poll interval.
- Negligible CPU when hidden (polling paused).
- Visual parity acceptable on macOS + Win11 + Win10 (glass baseline holds).
- User can move, persist position, and hide/disable trivially.
- Zero new backend data endpoints required (validates the reuse thesis).

---

## 9. Next steps & dependencies

1. **Verify** `recentRequests` shape in the n9router repo (provider field?) — unblocks D3.
2. **Decide** D1/D2/D4 with user.
3. Implementation (separate task) — note per `CLAUDE.md`: run `gitnexus_impact` before editing `lib.rs` / `open_terminal_window`, and `gitnexus_detect_changes` before commit.
   - Backend: `open_hud_window` command (clone terminal-window pattern) + `windowEffects` config.
   - Frontend: `HudPanel` component + window-label routing; reuse `getUsageStats`, format utils, theme tokens.
   - Persist HUD prefs in `tauri-plugin-store`.

**Dependencies:** n9router API (`recentRequests` field, optional), `tauri-plugin-positioner` (present), `tauri-plugin-store` (present), Tauri `windowEffects` (Tauri 2.x — present).

---

_This is a brainstorm/advisory report only. No code was modified._
