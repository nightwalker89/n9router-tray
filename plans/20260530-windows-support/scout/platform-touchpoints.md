# Scout — Platform-Specific Touchpoints

Goal: locate every macOS-bound line so the Windows port is fully scoped. Result: ~all OS logic is in one Rust file; frontend is platform-agnostic.

## Rust backend — `src-tauri/src/lib.rs` (762 lines) — HEAVY
| Lines | Symbol | macOS-specific bit |
|-------|--------|--------------------|
| 22-25 | `debug_log_path` | `$HOME` env |
| 38-44 | `chrono_timestamp` | shells out to `date` |
| 53-104 | `AppTarget`, `AGY_TARGETS`, `is_target_installed`, `find_target` | `.app` paths, `Contents/MacOS`, asar checks |
| 106-110 | `KNOWN_TERMINALS` | macOS terminal names |
| 125-200 | `parse_pids`, `is_main_process`, `find_all_pids_for`, `find_main_pid`, `kill_pid` | `pgrep -f`, `ps -o`, `/Contents/MacOS/`, `kill` |
| 206-233 | `find_n9router_pids`, `find_n9router_pid` | `lsof -ti :PORT` |
| 243-262 | `find_n9router_bin*` | `which` shell |
| 281-290 | `tail_log_file` | `$HOME` |
| 295-335 | `find_terminal_ancestor` | `ps -o ppid/command`, comm parsing |
| 379-434 | `antigravity_launch/quit/restart` | `setsid` via `pre_exec`, `libc` |
| 459-541 | `n9router_start` | `setsid`, `libc`, pipes |
| 601-643 | `n9router_focus_terminal` | `osascript ... activate` |
| 698-702 | setup | `set_activation_policy(Accessory)` (macOS-only API) |
| 713-715 | tray | `icon_as_template(true)` (macOS template) |

All `#[tauri::command]` fns (339-670) return `serde_json::Value` with stable shapes → **frontend untouched** if shapes preserved.

## Rust entry — `src-tauri/src/main.rs`
- Already has `windows_subsystem = "windows"` guard. No change needed.

## Config
- `src-tauri/Cargo.toml`: `libc` unconditional (→ unix-only), `fix-path-env` git dep (no-op off macOS), `tauri` features fine. Add sysinfo/which/dirs/chrono/windows.
- `src-tauri/tauri.conf.json`: targets `["dmg","app"]` → add nsis/msi; macOS block only; need `bundle.windows`.
- `src-tauri/capabilities/default.json`: permissions already cross-platform; autostart perms present.

## Frontend — platform-agnostic (drives HTTP API + stable invokes)
- `src/api/client.js`: pure HTTP to `localhost:20128`. No change.
- `src/panels/MitmPanel.jsx`: `invoke("antigravity_launch"/"antigravity_restart")`, `api.closeAgy`. No change (command shapes preserved).
- `src/panels/TerminalPanel.jsx`: `invoke("n9router_focus_terminal"/"n9router_get_logs")`, reads `{ok,app,fallback,reason}`. No change (contract preserved).
- `src/hooks/useAutoStart.js`, `usePolling.js`: generic.
- `src/panels/SettingsPanel.jsx:285-286`: copy "log in to macOS" → OS-neutral (cosmetic).
- `src/App.css:1,78`: comments only.

## CLI / packaging
- `bin/n9tray.js`: `open -a` + `/Applications` (macOS-only).
- `lib/installer.js`: DMG/`hdiutil` (macOS-only).
- `scripts/publish/package.json`: `"os":["darwin"]`.
- `scripts/install.sh`: macOS DMG; need `install.ps1`.
- `scripts/build-dmg.sh`, `publish-npm.sh`: macOS build helpers (leave; add Windows equivalents in package.json scripts).

## CI
- `.github/workflows/release.yml`: single macOS job. Add windows-latest job.

## Conclusion
Effort centers on `lib.rs` (refactor to `platform/`), `Cargo.toml`, `tauri.conf.json`, CLI JS (2 files), CI (1 file). Frontend ~1 cosmetic edit. No new API surface.
