# Phase 4: Cargo Deps + Tauri Config + Tray/Main

## Context Links
- Parent: `plan.md` · Depends on: Phase 1-3 (consumes crates)
- Research: `research/researcher-01-tauri-cross-platform.md`
- Files: `src-tauri/Cargo.toml`, `tauri.conf.json`, `capabilities/default.json`, `lib.rs`, `main.rs`, `package.json`

## Overview
Date: 2026-05-30 · Priority: medium · Status: pending

Add cross-platform + Windows-only crates, scope `libc`/`fix-path-env` to unix, configure NSIS+MSI bundle targets and `bundle.windows`, gate macOS-only tray/setup calls, and (optionally) add single-instance.

## Key Insights
- Tauri auto-skips bundle targets invalid for the build host → one combined target list is safe.
- `icon_as_template(true)` is macOS-only → gate it; use colored `icon.ico` on Windows.
- `set_activation_policy(Accessory)` already cfg-guarded — keep.
- WebView2 auto-installed by NSIS bootstrapper.
- `fix-path-env::fix()` only needed on macOS GUI; wrap call in `#[cfg(unix)]` (it's a git dep, scope it unix to drop from Windows build).
- **No-macOS-impact rule:** every `lib.rs` edit here is a surgical `#[cfg]` addition; the macOS branch stays byte-identical. The shell-`date` timestamp is NOT rewritten on macOS — it is gated `#[cfg(target_os="macos")]` and a Windows twin lives in `platform_windows.rs`. So `chrono` is a WINDOWS-ONLY dep (macOS build gains no new crate).

## Requirements
### Functional
1. Cargo deps: `sysinfo`, `which`, `dirs` (cross); `windows`,`chrono` (win-only); `libc`,`fix-path-env` (unix-scoped).
2. `tauri.conf.json` targets include `nsis`,`msi`; add `bundle.windows`.
3. Tray icon: template on macOS, colored on Windows (gated call site).
4. Windows `chrono_timestamp()` (in `platform_windows.rs`) replaces shell-`date`; macOS keeps existing `date` impl (gated, unchanged).
5. (Optional) `tauri-plugin-single-instance` + capability perm.
### Non-functional
6. macOS build unchanged (DMG still produced).
7. Windows build produces `*-setup.exe` (+ `*.msi`).

## Architecture — Cargo.toml
```toml
[dependencies]
serde_json = "1"
serde = { version = "1", features = ["derive"] }
log = "0.4"
tauri = { version = "2", features = ["tray-icon","image-png"] } # macos-private-api stays (ignored on win)
tauri-plugin-log = "2"
tauri-plugin-positioner = { version = "2", features = ["tray-icon"] }
tauri-plugin-shell = "2"
tauri-plugin-http = { version = "2", features = ["default","unsafe-headers"] }
tauri-plugin-store = "2"
tauri-plugin-autostart = "2"
tauri-plugin-single-instance = "2"   # optional
open = "5"
once_cell = "1"
sysinfo = "0.32"
which = "6"
dirs = "5"

[target.'cfg(unix)'.dependencies]
libc = "0.2"
fix-path-env = { git = "https://github.com/tauri-apps/fix-path-env-rs", version = "0.0.0" }

[target.'cfg(windows)'.dependencies]
chrono = { version = "0.4", default-features = false, features = ["clock"] }
windows = { version = "0.58", features = [
  "Win32_Foundation","Win32_UI_WindowsAndMessaging","Win32_System_Threading" ] }
```
Note: `chrono` is Windows-only so the macOS build is unchanged. `sysinfo`/`which`/`dirs` are cross-platform but only invoked from Windows seam fns; on macOS they're unused deps (acceptable) — alternatively scope them `cfg(windows)` too if a zero-new-macOS-deps build is desired (see Open Question note).

## tauri.conf.json
```jsonc
"bundle": {
  "active": true,
  "targets": ["dmg","app","nsis","msi"],
  "icon": [ ...existing..., "icons/icon.ico" ],
  "macOS": { "minimumSystemVersion": "13.0" },
  "windows": {
    "nsis": { "installMode": "currentUser" },   // perUser → no admin; CLI probes LOCALAPPDATA
    "webviewInstallMode": { "type": "downloadBootstrapper" }
  }
}
```
Keep `app.macOSPrivateApi:true` (ignored on Windows). Evaluate transparent popup on Windows; if glitchy, conditionally set opaque bg via CSS/media (note only — frontend Phase 7).

## lib.rs / main.rs (surgical cfg edits only — macOS branch unchanged)
- `#[cfg(unix)] let _ = fix_path_env::fix();` (still runs on macOS).
- Tray icon: gate ONLY the template call, e.g. keep macOS `.icon(tray-icon.png).icon_as_template(true)`; add a `#[cfg(target_os="windows")]` arm using colored `icon.ico`. macOS arm byte-identical.
- `chrono_timestamp()`: add `#[cfg(target_os="macos")]` to the existing shell-`date` fn (body unchanged); the `#[cfg(target_os="windows")]` twin lives in `platform_windows.rs`.
- (Optional) register `tauri_plugin_single_instance::init(...)` FIRST in builder — one added line; macOS focus-existing-window behavior is benign.
- `main.rs`: keep existing `windows_subsystem` line (no edit).

## capabilities/default.json
- If single-instance added, no extra permission usually needed; verify. Keep existing perms.

## package.json
```json
"tauri:build:windows": "tauri build --target x86_64-pc-windows-msvc"
```

## Related Code Files
- `src-tauri/Cargo.toml`, `tauri.conf.json`, `capabilities/default.json`
- `src-tauri/src/lib.rs`, `src-tauri/src/main.rs`
- `package.json`

## Implementation Steps
1. Edit Cargo.toml deps (cross + target-scoped; chrono windows-only).
2. Gate existing `chrono_timestamp()` macOS-only; add Windows twin in `platform_windows.rs`.
3. Gate `fix_path_env::fix()` unix-only.
4. Tray icon: add Windows cfg arm; keep macOS arm + activation-policy guard identical.
5. Optional single-instance plugin + builder wiring.
6. tauri.conf.json targets + bundle.windows.
7. Add windows build script.
8. macOS `cargo build` regression check (diff = no behavioral change); Windows build via Phase 6 CI.

## Todo
- [ ] Cargo deps updated + target-scoped (chrono windows-only)
- [ ] macOS `chrono_timestamp()` gated + Windows twin in platform_windows.rs
- [ ] fix-path-env unix-gated
- [ ] tray icon Windows cfg arm (macOS arm unchanged)
- [ ] single-instance (if approved)
- [ ] nsis/msi + bundle.windows
- [ ] tauri:build:windows script
- [ ] macOS build unaffected (behavioral diff = none)

## Success Criteria
- macOS DMG builds + runs as before.
- Windows build emits NSIS `.exe` (+ MSI), no console window, colored tray icon.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `windows` crate version/features churn | Med | Med | Pin 0.58; minimal feature set |
| MSI/WiX flaky in CI | Med | Low | Ship NSIS primary; MSI optional/removable |
| Transparent popup glitch on Win | Med | Low | Fallback opaque bg (Phase 7) |
| single-instance changes startup flow | Low | Med | Optional; test tray toggle still works |

## Security Considerations
- `unsafe-headers` http feature already present (localhost only via capability allowlist) — unchanged.
- perUser NSIS install avoids requiring admin elevation.
- WebView2 bootstrapper downloads from Microsoft (trusted) at install time.

## Next Steps
Phase 5 makes the npm CLI/installer cross-platform to distribute the Windows build.
