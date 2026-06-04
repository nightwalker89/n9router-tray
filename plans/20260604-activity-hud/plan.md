# Plan — Live Activity HUD (floating widget)

**Date:** 2026-06-04 · **Status:** Draft (awaiting review) · **Appetite:** Medium · **Audience:** Public (macOS + Win10/11)

## Goal
Small always-on-top, glossy, frameless floating window (label `hud`, ~280×360) showing live n9router routing: in-flight requests, recent activity stream, recent provider+model, token usage. Constrained auto-rotating tabs. Glass design w/ per-OS vibrancy. Zero backend changes — all data from existing `api.getUsageStats`.

## Key context
- Data confirmed: `getUsageStats()` returns `activeRequests`, `recentRequests` (incl. `provider`), `byProvider/byModel`, totals, `errorProvider`. See `reports/01-findings.md`.
- Clone existing pattern: `open_terminal_window` (`src-tauri/src/lib.rs:811`) + hash routing `App.jsx:12` (`#terminal`). HUD = `#hud`.
- Brainstorm source: `plans/reports/brainstorm-2026-06-04-activity-hud.md`.
- **GitNexus mandate (CLAUDE.md):** run `gitnexus_impact` before editing `lib.rs`/`open_terminal_window`; `gitnexus_detect_changes` before commit.

## Scope guardrails (YAGNI)
IN: floating window, 4 glanceable tabs, constrained auto-rotate, glass + per-OS vibrancy, persisted visibility+position, offline state.
OUT: charts/graphs, history scrubbing, per-request drill-down, cost forecasting, configurable layouts, SSE (future upgrade — `/api/usage/stream`).

## Phases
| # | Phase | Status | Depends |
|---|-------|--------|---------|
| 01 | [Window + hash-routing skeleton](phase-01-window-routing-skeleton.md) | ⬜ Not started | — |
| 02 | [HUD UI + data + polling](phase-02-hud-ui-data-polling.md) | ⬜ Not started | 01 |
| 03 | [Auto-rotate + header strip](phase-03-autorotate-header.md) | ⬜ Not started | 02 |
| 04 | [Glass styling + per-OS vibrancy](phase-04-glass-styling-vibrancy.md) | ⬜ Not started | 01 |
| 05 | [Triggers + persistence](phase-05-triggers-persistence.md) | ⬜ Not started | 01 |
| 06 | [Cross-platform verification](phase-06-cross-platform-verification.md) | ⬜ Not started | 02-05 |

## Definition of done
HUD opens <300ms; live updates ≤3s; idle CPU ~0 when hidden; glass baseline holds on all 3 OSes; user can move/persist/hide; no new backend endpoints; gitnexus checks clean.

## Unresolved questions
See each phase's "Next steps"; consolidated list in `reports/01-findings.md`.
