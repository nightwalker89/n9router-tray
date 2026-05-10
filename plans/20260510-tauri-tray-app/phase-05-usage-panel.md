# Phase 5: Usage Stats Panel

> Parent: [plan.md](./plan.md) | Depends on: Phase 2 | Priority: P0 | Status: TODO

## Overview

Quick glance at today's usage: total requests, tokens, cost, active/pending requests, and recent request log.

## Key Insights

From n9router's `getUsageStats("24h")`:
- `totalRequests`, `totalPromptTokens`, `totalCompletionTokens`, `totalCachedTokens`, `totalCost`
- `activeRequests`: array of `{ model, provider, account, count }`
- `recentRequests`: last 20 requests with `{ timestamp, model, provider, promptTokens, completionTokens, status }`
- `byModel`: breakdown by model
- `errorProvider`: last error provider (auto-clears after 10s)

## Requirements

### Functional
- [ ] Today's summary: requests count, total tokens, total cost
- [ ] Live active requests (pending)
- [ ] Recent requests (last 5-10 items)
- [ ] Token format: compact (1.2k, 3.4M)
- [ ] Cost format: $0.82
- [ ] Error indicator for failed requests
- [ ] By-model breakdown (top 3)

### Non-functional
- Updates every 10s
- Compact layout — fits in popup

## UI Wireframe

```
┌─────────────────────────────────────┐
│  TODAY                              │
│  ┌──────┐ ┌──────┐ ┌──────┐       │
│  │  847  │ │12.4M │ │$0.82 │       │
│  │ reqs  │ │tokens│ │ cost │       │
│  └──────┘ └──────┘ └──────┘       │
│                                     │
│  ─── LIVE ───                       │
│  ● 3 active  claude-opus-4         │
│  ● 1 active  gpt-4o                │
│                                     │
│  ─── RECENT ───                     │
│  22:51  opus-4   1.2k→0.4k  ✅     │
│  22:49  gpt-4o   0.8k→0.2k  ✅     │
│  22:47  gemini   0.5k→─     ❌     │
│  22:45  opus-4   2.1k→0.8k  ✅     │
│  22:43  opus-4   0.3k→0.1k  ✅     │
│                                     │
│  ─── TOP MODELS ───                 │
│  claude-opus-4       █████ 420 reqs│
│  gpt-4o              ███   180 reqs│
│  gemini-2.5          ██    90 reqs │
│                                     │
│  [View Full Report ↗]               │
└─────────────────────────────────────┘
```

## Implementation Steps

1. Create `src/panels/UsagePanel.jsx`
2. Use `useUsageStats()` hook
3. Build stat cards row (requests, tokens, cost)
4. Build active requests list
5. Build recent requests log (last 5)
6. Build top models mini bar chart
7. Add "View Full Report" link → opens dashboard/usage

## Helper Functions

```javascript
// Format tokens: 1234 → "1.2k", 1234567 → "1.2M"
function formatTokens(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return String(n);
}

// Format cost: 0.82 → "$0.82", 12.5 → "$12.50"
function formatCost(n) {
  return "$" + n.toFixed(2);
}

// Format time: ISO → "22:51"
function formatTime(iso) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour12: false, hour: "2-digit", minute: "2-digit"
  });
}
```

## Todo

- [ ] Create `src/panels/UsagePanel.jsx`
- [ ] Create `src/utils/format.js` (formatTokens, formatCost, formatTime)
- [ ] Build stat cards row
- [ ] Build active requests section
- [ ] Build recent log section (last 5)
- [ ] Build top models mini chart
- [ ] Add "View Full Report" link
- [ ] Style with CSS

## Success Criteria

- Today's stats display correctly
- Active requests update in real-time
- Recent log shows last 5 requests with status
- Token/cost formatting is compact and readable
- Fits within 360px width popup

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| No usage data yet | Low | Low | Show "No data" state |
| Too many active requests | Low | Low | Cap at 5, show "+N more" |
