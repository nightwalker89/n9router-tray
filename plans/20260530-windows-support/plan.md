# Windows Support Plan — n9router-tray

## Overview

Port the macOS menu-bar app to Windows, replicating features as much as possible. Nearly all OS-specific code lives in `src-tauri/src/lib.rs`; the React frontend is platform-agnostic (drives n9router HTTP API + stable `invoke` commands). Work = add a thin cfg seam, put ALL Windows code in a NEW `platform_windows.rs`, add cross-platform CLI/installer, and a Windows CI job.

> [!IMPORTANT]
> **Design constraint (user):** Windows work must NOT impact existing macOS behavior. Put new code in SEPARATE files; modify existing files as little as possible. macOS implementations stay in `lib.rs` with bodies unchanged (only `#[cfg(target_os = "macos")]` attributes + a few call-site swaps added).

User-confirmed decisions: (1) adapt AGY launch patterns from `vscode-mirror-chat-panel` for AGYv2 + AGY-IDE; (2) Focus Terminal via Win32; (3) cross-platform npm CLI; (4) add Windows job to existing CI.

## Phases

| # | Phase | Status | Complexity |
|---|-------|--------|------------|
| 1 | Platform seam (macOS untouched, Windows in new file) | ✅ done 2026-05-30 | high |
| 2 | Windows process/launch/kill/port impl | ✅ done 2026-05-30 | high |
| 3 | Win32 terminal focus | ✅ done 2026-05-30 | medium |
| 4 | Cargo deps + Tauri config + tray/main | ✅ done 2026-05-30 | medium |
| 5 | Cross-platform npm CLI + installer | ✅ done 2026-05-30 | medium |
| 6 | Windows CI job + scripts + README | ✅ done 2026-05-30 | low |
| 7 | Frontend cosmetic + verification | ✅ done 2026-05-30 | low |

## Key Files

- `src-tauri/src/lib.rs` — MINIMAL edits: cfg attrs + 1 `mod` decl + 3 call-site swaps (macOS bodies unchanged)
- `src-tauri/src/platform_windows.rs` — NEW, all Windows seam fns (`#[cfg(target_os="windows")]`)
- `src-tauri/src/main.rs` — already windows_subsystem-guarded
- `src-tauri/Cargo.toml` — sysinfo, which, dirs, chrono, windows, target-scoped libc
- `src-tauri/tauri.conf.json` — nsis/msi targets + bundle.windows
- `bin/n9tray.js`, `lib/installer.js`, `scripts/publish/package.json`, `scripts/install.ps1` — CLI
- `.github/workflows/release.yml`, `package.json` — CI/build
- `src/panels/SettingsPanel.jsx` — cosmetic copy

## Dependencies Between Phases

- P2, P3 depend on P1 (interface must exist).
- P4 depends on P1-P3 (deps consumed by impls).
- P5, P6 are independent of P1-P4 but P6 CI validates the build from P4.
- P7 verification depends on all.

## Architecture Notes

- Tauri 2.x, React 18, Vite. Tray app, popup window.
- **Low-churn seam:** macOS seam fns STAY in `lib.rs` (bodies unchanged, gain `#[cfg(target_os="macos")]`). ALL Windows seam fns live in NEW `platform_windows.rs` (`#[cfg(target_os="windows")]`). Same fn names across the cfg boundary; only one compiles per target.
- No `platform/mod.rs`/`macos.rs`; macOS code is NOT relocated (rejected earlier idea — too much churn).
- `lib.rs` edits limited to: cfg attributes on OS-specific helpers, `mod platform_windows;` + `use`, and 3 call-site swaps where commands previously inlined OS code (`spawn_detached`, `spawn_n9router_piped`, `focus_terminal_impl`).
- All `#[tauri::command]` JSON shapes preserved → frontend stable.
- Windows: `sysinfo` (detection), `creation_flags` (detached launch), `taskkill /T /F` (tree kill), `netstat -ano` (port), Win32 `EnumWindows`+`SetForegroundWindow` (focus), `which`/`dirs` (paths).
- Packaging: NSIS + MSI; single npm `n9tray` package self-detects OS.

## Open Questions (see plan-questions.md)

1. Exact Windows Antigravity install paths + v1/v2/IDE distinction.
2. NSIS-only vs NSIS+MSI; perUser vs perMachine install.
3. Adopt `tauri-plugin-single-instance`?
4. Code signing cert available? (else SmartScreen warnings).

## Status: IMPLEMENTED + VERIFIED (2026-05-30)

All 7 phases implemented. Verified: macOS `cargo check`/`clippy` clean (no regression), Windows cross-compile clean via `cargo xwin check`, both targets warning-free, frontend build + CLI smoke test pass.

Open-question resolutions (coded defaults adopted): Q1 best-effort Windows AGY paths, Q2 NSIS+MSI / perUser, Q3 single-instance added (Windows-only, cfg-gated). Q4 (signing) and Q5 (n9router backend on Windows) remain user decisions before public release — see `plan-questions.md`.
