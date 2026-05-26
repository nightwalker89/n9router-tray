# Phase 1: Auto-start Tray on macOS Login

## Context Links

- Tauri plugin: https://github.com/nicholasgasior/tauri-plugin-autostart
- Crate: https://crates.io/crates/tauri-plugin-autostart
- Existing settings UI: `src/panels/SettingsPanel.jsx` (Section A "Tray")

## Overview

Add "Launch at Login" toggle so the tray app starts automatically when the user logs into macOS. Uses `tauri-plugin-autostart` which manages macOS Login Items via the Service Management framework.

## Key Insights

- The plugin handles all platform-specific login item registration (macOS uses SMAppService on 13+)
- Plugin state is self-managed — no need to persist in tray-settings.json
- Frontend communicates via `plugin:autostart|enable`, `plugin:autostart|disable`, `plugin:autostart|is_enabled`
- Must be registered BEFORE other plugins that depend on it in the builder chain

## Requirements

1. Add `tauri-plugin-autostart` crate dependency
2. Register plugin in Tauri builder with `MacosLauncher::LaunchAgent` strategy
3. Add "Launch at Login" toggle in SettingsPanel Section A
4. Toggle calls plugin commands directly (no store persistence needed)
5. On mount, query `is_enabled` to set initial toggle state

## Architecture

```
SettingsPanel.jsx
  └─ invoke("plugin:autostart|is_enabled") → initial state
  └─ toggle ON  → invoke("plugin:autostart|enable")
  └─ toggle OFF → invoke("plugin:autostart|disable")

lib.rs
  └─ .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
```

## Related Code Files

- `src-tauri/Cargo.toml` — add dependency
- `src-tauri/src/lib.rs` — register plugin (line ~584)
- `src/panels/SettingsPanel.jsx` — add toggle (after line 254)
- `src-tauri/capabilities/default.json` — may need autostart permission

## Implementation Steps

1. Add to `Cargo.toml` dependencies:
   ```toml
   tauri-plugin-autostart = "2"
   ```

2. In `lib.rs`, add import and register plugin:
   ```rust
   use tauri_plugin_autostart::MacosLauncher;
   // In run():
   .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
   ```

3. Add JS dependency (if separate package exists) or use invoke directly:
   ```bash
   npm install @tauri-apps/plugin-autostart  # check if available for v2
   ```
   If no npm package, use raw `invoke("plugin:autostart|enable")` etc.

4. In `SettingsPanel.jsx`, add state and toggle:
   ```jsx
   const [launchAtLogin, setLaunchAtLogin] = useState(false);

   // In the store load useEffect, also query autostart:
   invoke("plugin:autostart|is_enabled").then(setLaunchAtLogin).catch(() => {});

   // Toggle handler:
   const toggleLaunchAtLogin = async (val) => {
     try {
       await invoke(val ? "plugin:autostart|enable" : "plugin:autostart|disable");
       setLaunchAtLogin(val);
     } catch (e) { console.error("autostart toggle failed", e); }
   };
   ```

5. Add the toggle row in Section A, before the existing "Auto-start n9router" row:
   ```jsx
   <SettingRow label="Launch at Login" description="Start this tray app when you log in to macOS">
     <SettingToggle checked={launchAtLogin} onChange={toggleLaunchAtLogin} disabled={!storeReady} />
   </SettingRow>
   ```

6. Check if `src-tauri/capabilities/default.json` needs `autostart:allow-enable`, `autostart:allow-disable`, `autostart:allow-is-enabled` permissions.

## Todo

- [ ] Add `tauri-plugin-autostart` to Cargo.toml
- [ ] Register plugin in lib.rs with LaunchAgent strategy
- [ ] Add autostart permissions to capabilities if required
- [ ] Add "Launch at Login" toggle to SettingsPanel Section A
- [ ] Query `is_enabled` on component mount
- [ ] Test: enable toggle, log out/in, verify tray starts
- [ ] Test: disable toggle, log out/in, verify tray does NOT start

## Success Criteria

- Toggle ON → tray appears in Login Items (System Settings > General > Login Items)
- Toggle OFF → tray removed from Login Items
- State persists across app restarts (plugin manages this internally)
- No conflict with the existing "Auto-start n9router" setting

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Plugin not compatible with Tauri 2.x | Low | High | Check crate version compatibility before starting |
| macOS permissions dialog | Medium | Low | LaunchAgent strategy avoids SMAppService prompts on 13+ |
| Plugin conflicts with positioner | Low | Low | Register autostart before positioner in chain |

## Security Considerations

- LaunchAgent approach is sandboxed and user-scoped
- No elevated privileges required
- Login item is visible to user in System Settings

## Next Steps

After this phase, Phase 2 (auto-start n9router) will chain: login starts tray → tray auto-starts n9router.
