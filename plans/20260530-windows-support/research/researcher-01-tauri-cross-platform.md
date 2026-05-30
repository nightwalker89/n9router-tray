# Research 01 — Tauri 2.x Cross-Platform (macOS → Windows)

## Scope
How a Tauri 2 tray app written for macOS runs on Windows. Focus: tray, windowing, packaging, console suppression, single-instance.

## Key findings

### Tray icon
- `TrayIconBuilder` works on Windows. `icon_as_template(true)` is macOS-only (monochrome template); on Windows it is ignored but should be gated to avoid a washed-out icon. Use the colored `icon.ico`/PNG on Windows.
- Left-click toggle + `tauri-plugin-positioner` `TrayBottomCenter` works on Windows (positions near the system tray / taskbar clock). Behavior differs slightly (taskbar usually bottom) but acceptable.

### Window flags
- `transparent: true` + `decorations: false` + `shadow: false`: supported on Windows 10/11 via DWM, but transparent windows on Windows require `transparent` feature and can show artifacts. The tray popup (400x540, no decorations) generally renders fine.
- `skipTaskbar: true` works (keeps the popup off the taskbar). `alwaysOnTop` works.
- `macOSPrivateApi: true` is macOS-only; harmless key on Windows builds.

### Activation policy
- `app.set_activation_policy(ActivationPolicy::Accessory)` is macOS-only API — must stay under `#[cfg(target_os = "macos")]`. On Windows, hiding from taskbar is done via `skipTaskbar` + no main-window-visible-on-start.

### Console window suppression
- `main.rs` already has `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]` — release builds won't spawn a console. Good.
- Subprocess calls (`netstat`, `taskkill`) still flash a console window unless spawned with `CREATE_NO_WINDOW` (0x08000000) via `CommandExt::creation_flags`. Prefer pure-Rust `sysinfo` to avoid this.

### Packaging
- Bundle targets: `nsis` (.exe installer, recommended default) and `msi` (WiX v3, requires WiX toolset — preinstalled on `windows-latest` GH runner). Tauri auto-skips targets not valid for the host OS, so a combined `["dmg","app","nsis","msi"]` list is safe.
- NSIS default install dir: `%LOCALAPPDATA%\<productName>` (perMachine vs perUser configurable). Product name `"n9router tray"` → install path `%LOCALAPPDATA%\n9router tray\n9router tray.exe` for perUser, or `C:\Program Files\n9router tray\` for perMachine.
- WebView2: NSIS bootstrapper auto-downloads WebView2 runtime (`downloadBootstrapper` mode). Win11 ships it; Win10 may need it.
- Icons: Windows needs `icon.ico` (present). Square*Logo.png are for MSIX (not used here).

### Single-instance
- `tauri-plugin-single-instance` recommended for Windows where users re-run the exe. Callback re-shows tray/main window. macOS less critical but harmless.

### Autostart
- `tauri-plugin-autostart` supports Windows (registry `Run` key) and macOS (LaunchAgent). The `MacosLauncher` arg only affects macOS; Windows path works with the same plugin init. Copy text should be OS-neutral.

## Risks
- Transparent undecorated popup may need a fallback (opaque bg) if rendering glitches on some Windows GPUs.
- MSI build needs WiX; if flaky in CI, ship NSIS-only.

## References
- Tauri v2 bundle/Windows docs, `tauri-plugin-single-instance`, `tauri-plugin-positioner`, reference project `vscode-mirror-chat-panel` (Windows build via cargo-xwin + windows-latest patterns).
