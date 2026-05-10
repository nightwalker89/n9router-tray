# Phase 1: Project Scaffold

> Parent: [plan.md](./plan.md) | Priority: P0 | Status: TODO

## Overview

Set up Tauri v2 + React + Vite project with proper macOS menu bar behavior:
- Frameless popup window
- System tray icon with click toggle
- ActivationPolicy::Accessory (no Dock icon)
- Auto-hide on focus loss
- Dark theme foundation

## Key Insights

From research:
- Tauri v2 uses `TrayIconBuilder` in Rust for tray management
- Window config: `decorations: false`, `alwaysOnTop: true`, `skipTaskbar: true`
- macOS: `set_activation_policy(Accessory)` to hide from Dock
- `tauri-plugin-positioner` positions window under tray icon
- Hide on blur: listen `window.blur` → `appWindow.hide()`
- Use template image icons for macOS dark/light mode support
- CORS: Tauri v2 uses `tauri-plugin-http` or configure CSP for localhost

## Requirements

### Functional
- [x] Tauri v2 project compiles and runs
- [x] Tray icon visible in macOS menu bar
- [x] Click tray icon → popup window appears/hides
- [x] Window positioned below tray icon
- [x] Window hides when clicking outside
- [x] No Dock icon (Accessory mode)
- [x] React renders basic "Hello" in popup

### Non-functional
- Bundle < 10MB
- Cold start < 2s
- Popup show < 100ms

## Architecture Decisions

### Rust (src-tauri/src/lib.rs)
```rust
// Key setup:
// 1. Set activation policy to Accessory (no Dock icon)
// 2. Create TrayIcon with template image
// 3. On tray click: toggle window show/hide + position
// 4. On window blur: hide window
```

### Tauri Config (tauri.conf.json)
```json
{
  "app": {
    "windows": [{
      "label": "main",
      "title": "n9 Control",
      "width": 360,
      "height": 520,
      "visible": false,
      "decorations": false,
      "alwaysOnTop": true,
      "skipTaskbar": true,
      "transparent": true,
      "resizable": false
    }],
    "security": {
      "csp": "default-src 'self'; connect-src 'self' http://localhost:20128; style-src 'self' 'unsafe-inline'"
    }
  }
}
```

### Cargo Dependencies
```toml
[dependencies]
tauri = { version = "2", features = ["tray-icon"] }
tauri-plugin-positioner = "2"
tauri-plugin-http = "2"
tauri-plugin-shell = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

### Frontend Dependencies (package.json)
```json
{
  "dependencies": {
    "@tauri-apps/api": "^2.5.0",
    "@tauri-apps/plugin-http": "^2.4.4",
    "@tauri-apps/plugin-shell": "^2.2.1",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.11.1",
    "@vitejs/plugin-react": "^4.3.4",
    "vite": "^6.0.3"
  }
}
```

## Related Files

| File | Purpose |
|------|---------|
| `src-tauri/src/lib.rs` | Tray icon setup, window management |
| `src-tauri/tauri.conf.json` | Window + security config |
| `src-tauri/Cargo.toml` | Rust dependencies |
| `src/main.jsx` | React entry |
| `src/App.jsx` | Root with tab navigation |
| `src/App.css` | Dark theme, glassmorphism |
| `index.html` | HTML shell |
| `package.json` | JS deps |
| `vite.config.js` | Vite + React plugin |

## Implementation Steps

1. Initialize Tauri v2 in existing project dir with `npm run tauri init`
2. Configure `tauri.conf.json` — frameless, transparent, hidden window
3. Add Rust tray icon logic in `lib.rs`:
   - Template icon (light/dark mode)
   - Click handler: toggle visibility + positioner
   - Blur handler: hide window
   - Activation policy: Accessory
4. Install Tauri plugins: positioner, http, shell
5. Create minimal React app: `main.jsx`, `App.jsx`, `App.css`
6. Set up dark theme CSS with CSS variables
7. Verify `cargo tauri dev` launches tray icon
8. Verify click → popup → blur → hide cycle works

## Todo

- [ ] Run `npm install` to install JS dependencies
- [ ] Run `npm run tauri init` to scaffold src-tauri/
- [ ] Configure `tauri.conf.json` window settings
- [ ] Add tray-icon feature to Cargo.toml
- [ ] Install tauri-plugin-positioner
- [ ] Write Rust tray setup in lib.rs
- [ ] Create React app skeleton (main.jsx, App.jsx)
- [ ] Create dark theme CSS foundation
- [ ] Create index.html
- [ ] Test: `cargo tauri dev` → tray icon appears
- [ ] Test: click → popup shows/hides
- [ ] Test: click outside → popup hides

## Success Criteria

- `cargo tauri dev` runs without errors
- Tray icon visible in macOS menu bar
- Popup appears/disappears on click
- Window closes on focus loss
- No Dock icon
- React renders content in popup

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| positioner plugin v2 compat | Low | Medium | Manual position calc fallback |
| Transparent window macOS | Low | Low | Remove transparency if issues |
| Rust compile time | Medium | Low | First build ~2min, then incremental |
