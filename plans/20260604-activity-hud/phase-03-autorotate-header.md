# Phase 03 — Auto-rotate + header strip

## Context links
- Parent: [plan.md](plan.md) · Depends: Phase 02

## Overview
- **Date:** 2026-06-04
- **Description:** Constrained auto-rotating tabs + always-visible header chip. Implements decision D1.
- **Priority:** P1 · **Impl status:** ⬜ Not started · **Review status:** ⬜ Pending

## Key insights
- Naive carousel is the #1 reason widgets get disabled → must pause-on-hover + sticky-Live + manual override.

## Requirements
- Tabs order: **Live → Recent → Providers → Models**, auto-advance every ~7s.
- **Pause on hover** (mouseenter stop / mouseleave resume).
- **Manual dots** + click-to-jump; manual interaction pauses auto until idle (~15s no interaction → resume).
- **Sticky Live**: while `activeRequests.length > 0`, do not auto-rotate off Live.
- **Persistent header strip** (all tabs): last provider+model chip (`recentRequests[0]`), rolling total tokens, error chip if `errorProvider`.
- Tab indicator dots at bottom.

## Architecture
- `activeTab` state + `useRef` rotation timer; `paused` derived from hover/manual/sticky.
- Effect re-arms timer when `paused`/`activeRequests` change; skip advance while sticky.
- Header is a sibling above the tab viewport (not part of rotation).

## Related code files
- `src/panels/HudPanel.jsx` (rotation controller + header + dots)
- `src/App.css` (dots/active states — minimal; full glass in P04)

## Implementation steps
1. Add `activeTab`, `lastInteraction`, hover state.
2. Rotation timer respecting pause/sticky; clear on unmount.
3. Header strip component (provider+model+tokens+error chip).
4. Dots w/ click handlers; manual pause window.
5. Manual test rotation/hover/sticky/error-chip.

## Todo
- [ ] Rotation timer + pause logic
- [ ] Sticky-Live
- [ ] Header chip + error chip
- [ ] Dots + manual jump
- [ ] Manual UX test

## Success criteria
- Tabs cycle ~7s; hover pauses; clicking a dot pauses then resumes after idle; Live never auto-leaves during in-flight; header always shows last provider/model/tokens; error chip appears ≤ its 10s window.

## Risk assessment
- Timer leaks/double-arm on re-render (Med) → single ref, cleanup.
- Rotation fighting user (Med) → generous idle resume + hover pause.

## Security considerations
- None new.

## Next steps
- → Phase 04 styling. Open Q: confirm idle-resume delay (~15s) feels right in review.
