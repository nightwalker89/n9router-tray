# Phase 4: Providers & Models Panel

> Parent: [plan.md](./plan.md) | Depends on: Phase 2 | Priority: P1 | Status: TODO

## Overview

Display connected providers, active model combos, and provide a combo switcher. This panel gives a quick overview of what AI backend capacity is available.

## Key Insights

From n9router APIs:
- `GET /api/providers` → list of provider connections with status
- `GET /api/provider-nodes` → available provider types
- `GET /api/combos` → named model sequences (e.g., "pro-stack", "cheap-stack")
- Provider connections have: `id, name, email, provider, status, valid`
- Combos have: `id, name, models: [{ model, provider }]`

## Requirements

### Functional
- [ ] List active providers with connection status
- [ ] Show current combo name
- [ ] Display models in current combo (ordered)
- [ ] Provider health indicators (✅ valid / ⚠️ issues)
- [ ] "Open Dashboard" link → opens browser to n9router dashboard

### Non-functional
- Provider list fits in compact popup (max 6 visible, scroll if more)

## UI Wireframe

```
┌─────────────────────────────────────┐
│  ACTIVE COMBO                       │
│  [pro-stack             ▾]          │
│  1. claude-opus-4 (Anthropic)      │
│  2. gpt-4o (OpenAI)                │
│  3. gemini-2.5 (Gemini)            │
│                                     │
│  ─── PROVIDERS ───                  │
│  ✅ Anthropic    2 accounts         │
│  ✅ OpenAI       1 account          │
│  ⚠️ Gemini      quota warning       │
│  ✅ Cursor       3 accounts         │
│                                     │
│  [Open Dashboard ↗]                 │
└─────────────────────────────────────┘
```

## Implementation Steps

1. Create `src/panels/ProvidersPanel.jsx`
2. Use `useProviders()` hook for provider + combo data
3. Build combo selector dropdown
4. Build provider list with status icons
5. Add "Open Dashboard" button (opens external browser)
6. Style compact layout

## Todo

- [ ] Create `src/panels/ProvidersPanel.jsx`
- [ ] Build combo selector component
- [ ] Build provider status list
- [ ] Add "Open Dashboard" link via `tauri-plugin-shell` open
- [ ] Style with CSS

## Success Criteria

- Provider list displays with correct status
- Combo selector shows current combo
- "Open Dashboard" opens browser
- Fits within 360px width popup

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Too many providers → overflow | Low | Low | Scrollable list, max-height |
| Combo switch API missing | Medium | Medium | Read-only initially, add switch later |
