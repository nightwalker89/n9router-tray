# n9router Tauri Tray App — Implementation Plan

> Date: 2026-05-10 | Status: DRAFT | Priority: HIGH

## Objective

Build a macOS menu bar tray app using **Tauri v2 + React + Vite** that provides quick-access control for n9router's MITM proxy, provider/model management, and usage monitoring — without needing to open the web dashboard.

## Architecture

```
n9router-tray/
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs           # Tauri setup, tray icon, window management
│   │   └── main.rs          # Entry point
│   ├── icons/               # Tray icon assets (template images)
│   ├── Cargo.toml
│   └── tauri.conf.json      # Window config (frameless, skip-taskbar)
├── src/
│   ├── main.jsx             # React entry
│   ├── App.jsx              # Root component + tab router
│   ├── App.css              # Global styles (dark theme, macOS feel)
│   ├── api/                 # API client layer
│   │   └── client.js        # fetch wrapper → localhost:20128
│   ├── hooks/               # Shared hooks
│   │   ├── useMitmStatus.js
│   │   ├── useProviders.js
│   │   └── useUsageStats.js
│   └── panels/              # 3 main panels
│       ├── MitmPanel.jsx
│       ├── ProvidersPanel.jsx
│       └── UsagePanel.jsx
├── index.html
├── vite.config.js
└── package.json
```

## n9router API Surface (consumed by tray app)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/cli-tools/antigravity-mitm` | GET | MITM status (running, cert, DNS) |
| `/api/cli-tools/antigravity-mitm` | POST | Start MITM server |
| `/api/cli-tools/antigravity-mitm` | DELETE | Stop MITM server |
| `/api/cli-tools/antigravity-mitm` | PATCH | Toggle DNS per tool / trust cert |
| `/api/usage/stats?period=24h` | GET | Today's usage (tokens, cost, by-model) |
| `/api/providers` | GET | Provider connections list |
| `/api/provider-nodes` | GET | Provider nodes (available providers) |
| `/api/combos` | GET | Model combos |
| `/api/health` | GET | Server health check |

## Phases

| Phase | File | Description |
|-------|------|-------------|
| 01 | [phase-01-project-scaffold.md](./phase-01-project-scaffold.md) | Tauri + React + Vite project setup |
| 02 | [phase-02-api-and-hooks.md](./phase-02-api-and-hooks.md) | API client, polling hooks |
| 03 | [phase-03-mitm-panel.md](./phase-03-mitm-panel.md) | MITM control panel |
| 04 | [phase-04-providers-panel.md](./phase-04-providers-panel.md) | Providers & combos panel |
| 05 | [phase-05-usage-panel.md](./phase-05-usage-panel.md) | Usage stats panel |
| 06 | [phase-06-polish.md](./phase-06-polish.md) | Tray icon, animations, build |

## Key Decisions

1. **React** (not Svelte) — reuse patterns from n9router dashboard
2. **Tauri v2** — native tray, ~5MB bundle, macOS-first
3. **Polling** over SSE — simpler for tray popup (show/hide lifecycle)
4. **Vanilla CSS** with CSS variables — macOS dark theme, glassmorphism
5. **No Tailwind** — keep bundle minimal, full CSS control
6. **Single window** — frameless popup positioned under tray icon

## Risks

- Tauri `positioner` plugin compatibility with v2
- CORS for `localhost:20128` in Tauri webview production builds
- macOS notarization for distribution
