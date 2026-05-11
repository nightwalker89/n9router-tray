# n9router-tray: Terminal Window + Settings Page

## Overview

Add two features to the tray app:
1. **Stdout terminal window** — floating panel showing n9router stdout (tray-started) or focusing the external terminal (externally-started)
2. **Settings page** — gear icon tab with all n9router profile settings + tray-specific settings (auto-start n9router on tray launch)

---

## Phase 1: Stdout Terminal Window

### 1.1 Rust — Managed Process with Piped Stdout

**File:** `src-tauri/src/lib.rs`

Refactor `n9router_start` to pipe stdout/stderr instead of discarding them. Store the child handle + output buffer in a `Mutex<Option<ManagedProcess>>`.

```rust
struct ManagedProcess {
    child: std::process::Child,
    stdout_lines: Arc<Mutex<VecDeque<String>>>,  // ring buffer, last 2000 lines
}
static N9_PROCESS: Lazy<Mutex<Option<ManagedProcess>>> = ...;
```

**New/modified Tauri commands:**

| Command | Purpose |
|---------|---------|
| `n9router_start` | Spawn with piped stdout/stderr, spawn reader thread pushing to ring buffer. If already running externally, detect and track as unmanaged |
| `n9router_get_logs` | Return `{ lines: string[], managed: bool, pid: u32 }` — last N lines from buffer if tray-managed, or last N lines from `~/.n9router/log.txt` if external |
| `n9router_focus_terminal` | If external process: walk PID → PPID chain → find terminal app → AppleScript `activate` |

**Focus terminal logic (for externally-started n9router):**

```rust
fn focus_parent_terminal(pid: u32) -> Result<String, String> {
    // 1. Walk ppid chain: pid → ppid → ppid...
    // 2. At each step, check process comm against known terminal apps:
    //    Terminal.app, iTerm2, kitty, Alacritty, WezTerm, Warp, Tabby
    // 3. If found: osascript -e 'tell application "<AppName>" to activate'
    // 4. If not found (launchd/Chrome ancestor): return Err with fallback hint
}
```

**Feasibility confirmed:** AppleScript `tell application "System Events" to set frontProcess to first process whose name is "Terminal"` works. Parent PID chain walkable via `ps -o ppid=`.

If no terminal ancestor found → fall back to showing `~/.n9router/log.txt` tail in the panel.

### 1.2 Frontend — Terminal Panel

**File:** `src/panels/TerminalPanel.jsx` (new)

- Dark monospace scrollable log area (terminal aesthetic)
- Auto-scroll to bottom with "pin to bottom" toggle
- Poll `n9router_get_logs({ count: 200 })` every 1s
- Header bar shows:
  - `● Managed by tray` (green dot) or `● External process` (yellow dot)
  - If external: **"Focus Terminal"** button → calls `n9router_focus_terminal`
  - If external + no terminal found: falls back to `log.txt` tail, shows info message
- Clear button to reset the view
- Line count indicator (e.g. "1,247 lines")

### 1.3 Floating Window

**File:** `src-tauri/tauri.conf.json` — no static window config needed.

**Dynamic window creation** via Rust command `open_terminal_window`:

```rust
#[tauri::command]
fn open_terminal_window(app: tauri::AppHandle) -> Result<(), String> {
    // If window "terminal" exists, show + focus it
    // Otherwise create via WebviewWindowBuilder:
    //   label: "terminal", title: "n9router Logs"
    //   url: "index.html#terminal", 600x400, decorations: true
    //   resizable: true, center: true, always_on_top: false
}
```

**Routing:** Since this is a single-page Vite app, use hash routing:
- `/#terminal` → renders `TerminalPanel`
- Default (`/`) → renders the main tray UI

**File:** `src/App.jsx` — check `window.location.hash`:

```jsx
if (window.location.hash === "#terminal") {
  return <TerminalPanel />;
}
// ... normal tray UI
```

**Status bar update:** Add a `📋` log icon button next to Start/Stop that invokes `open_terminal_window`.

**Capabilities:** Add `"terminal"` to windows array in `default.json`, add `"core:window:allow-create"`.

---

## Phase 2: Settings Page

### 2.1 Rust — Store Plugin

**File:** `src-tauri/Cargo.toml` — add dependencies:
```toml
tauri-plugin-store = "2"
once_cell = "1"
```

**File:** `src-tauri/src/lib.rs` — register plugin:
```rust
.plugin(tauri_plugin_store::Builder::default().build())
```

**File:** `src-tauri/capabilities/default.json` — add permissions:
```json
"store:allow-get", "store:allow-set", "store:allow-save", "store:allow-load"
```

Tray settings stored in `tray-settings.json` (Tauri store creates in app data dir):
```json
{
  "autoStartN9router": false
}
```

### 2.2 Settings Panel Component

**File:** `src/panels/SettingsPanel.jsx` (new)

Two visually separated sections:

#### Section A: 🖥️ Tray Settings

| Setting | Type | Storage | Notes |
|---------|------|---------|-------|
| Auto-start n9router on tray launch | Toggle | `tauri-plugin-store` | When ON, tray starts n9router if not already running |

#### Section B: ⚙️ n9router Settings (from `PATCH /api/settings`)

All profile page settings, compact toggle-list layout:

| Group | Settings | UI Widget |
|-------|----------|-----------|
| **Routing** | Round Robin (`fallbackStrategy`) | Toggle |
| | Sticky Limit (`stickyRoundRobinLimit`) | Number input (shown when RR on) |
| | Combo Round Robin (`comboStrategy`) | Toggle |
| | Combo Sticky Limit (`comboStickyRoundRobinLimit`) | Number input (shown when combo RR on) |
| **Security** | Require Login (`requireLogin`) | Toggle |
| | Change Password | Expandable form (current + new + confirm) |
| **Network** | Outbound Proxy (`outboundProxyEnabled`) | Toggle |
| | Proxy URL (`outboundProxyUrl`) | Text input (shown when proxy on) |
| | No-Proxy (`outboundNoProxy`) | Text input (shown when proxy on) |
| | Test Proxy button | Button |
| **Observability** | Enable Observability (`observabilityEnabled`) | Toggle |
| | MITM Debug Logs (`mitmAntigravityDebugLogsEnabled`) | Toggle |
| | Auto-disable Empty Sonnet (`mitmAntigravityAutoDisableOnSonnetZero`) | Toggle |
| | Payload Guard (`mitmAntigravityPayloadGuardEnabled`) | Toggle |
| | Host Rewrite (`mitmAntigravityHostRewriteEnabled`) | Toggle |
| | IDE Version Override (`mitmAntigravityIdeVersionOverrideEnabled`) | Toggle + version input |
| **Data** | Mask Emails (`tokenSwapMaskEmails`) | Toggle |
| | Hourly DB Backups (`periodicDbBackupsEnabled`) | Toggle |

All toggles use optimistic UI:
1. Update local state immediately
2. Send `authRequest("PATCH", "/api/settings", { key: value })`
3. Rollback on error

### 2.3 Tab Bar — Gear Icon (Top Right)

**File:** `src/App.jsx`

```jsx
const TABS = [
  { id: "mitm", label: "MITM", icon: "🛡️" },
  { id: "providers", label: "Providers", icon: "🔌" },
  { id: "usage", label: "Usage", icon: "📊" },
];

// In render:
<div className="tab-bar">
  <span className="tab-bar-title">n9</span>
  {TABS.map(tab => <TabButton ... />)}
  {/* Spacer */}
  <div style={{ flex: 1 }} />
  {/* Gear — icon only, right-aligned */}
  <button
    className={`tab-button gear ${activeTab === "settings" ? "active" : ""}`}
    onClick={() => setActiveTab("settings")}
  >⚙️</button>
</div>

{activeTab === "settings" && <SettingsPanel />}
```

### 2.4 Auto-Start on Tray Launch

**File:** `src/hooks/useAutoStart.js` (new)

```jsx
export function useAutoStart() {
  useEffect(() => {
    (async () => {
      const store = await load("tray-settings.json");
      const autoStart = await store.get("autoStartN9router");
      if (!autoStart) return;

      const status = await invoke("n9router_status");
      if (!status.running) {
        await invoke("n9router_start");
      }
    })();
  }, []);
}
```

Called once in `App.jsx` on mount.

---

## Phase 3: Polish

### 3.1 CSS Additions

**File:** `src/App.css`

```css
/* Terminal panel */
.terminal-panel { ... }           /* dark bg, monospace, scrollable */
.terminal-line { ... }            /* single log line */
.terminal-header { ... }          /* status + controls */

/* Settings panel */
.settings-section { ... }         /* section card */
.settings-section-title { ... }   /* section header */
.setting-row { ... }              /* label + toggle row */
.setting-input { ... }            /* compact number/text input */

/* Gear tab button */
.tab-button.gear { ... }          /* no text, icon-only sizing */
```

### 3.2 Status Bar Log Button

Add a small log icon `📋` button to the status bar (next to Start/Stop) that opens the floating terminal window.

---

## Files Summary

### New Files

| File | Purpose |
|------|---------|
| `src/panels/TerminalPanel.jsx` | Stdout/log viewer with focus-terminal support |
| `src/panels/SettingsPanel.jsx` | All settings (tray + n9router) |
| `src/hooks/useAutoStart.js` | Auto-start n9router on tray launch |

### Modified Files

| File | Change |
|------|--------|
| `src-tauri/src/lib.rs` | Managed process w/ piped stdout, `n9router_get_logs`, `n9router_focus_terminal`, `open_terminal_window`, store plugin |
| `src-tauri/Cargo.toml` | Add `tauri-plugin-store`, `once_cell` |
| `src-tauri/tauri.conf.json` | (optional) terminal window preset |
| `src-tauri/capabilities/default.json` | Add terminal window + store + window-create permissions |
| `src/App.jsx` | Hash routing for terminal, gear tab, auto-start hook |
| `src/App.css` | Terminal styles, settings styles, gear button styles |

---

## Execution Order

```
1.1  Rust: managed process + piped stdout + ring buffer
1.1b Rust: n9router_get_logs + n9router_focus_terminal commands
1.3  Rust: open_terminal_window command + capabilities
1.2  Frontend: TerminalPanel.jsx + hash routing
2.4  Rust: store plugin setup
2.1  Frontend: SettingsPanel.jsx
2.2  Frontend: gear tab in App.jsx
2.3  Frontend: useAutoStart hook
3.x  CSS polish + status bar log button
```

Rust changes first (recompilation), then frontend (HMR).

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| AppleScript `activate` needs Accessibility permissions | Show "Grant permission in System Preferences" hint; fall back to log.txt tail |
| Stdout buffer memory | Ring buffer (VecDeque) capped at 2000 lines, ~200KB max |
| External process started by non-terminal (Chrome, launchd) | Detect → fall back to log.txt tail with info message |
| Store plugin binary size | ~50KB, acceptable for tray app |
| Settings race between tray and web dashboard | Tray polls settings every 30s already; changes reflect within 30s |

## Estimated Effort

| Phase | Effort |
|-------|--------|
| Phase 1: Terminal Window (Rust + Frontend) | ~2h |
| Phase 2: Settings Page (Store + Frontend) | ~1.5h |
| Phase 3: Polish | ~30min |
| **Total** | **~4h** |
