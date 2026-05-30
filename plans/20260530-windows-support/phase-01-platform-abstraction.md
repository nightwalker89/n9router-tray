# Phase 1: Platform Seam (macOS Untouched, Windows in New File)

## Context Links
- Parent: `plan.md`
- Scout: `scout/platform-touchpoints.md` (all macOS lines in `lib.rs`)
- Source: `src-tauri/src/lib.rs` (762 lines)

## Overview
Date: 2026-05-30 · Priority: high · Status: pending

> [!IMPORTANT]
> **Design constraint (user):** Windows support must NOT impact existing macOS behavior, and must live in SEPARATE files — modifying existing files as little as possible.

Introduce a thin **cfg-selected free-function seam**. macOS implementations STAY in `lib.rs` (bodies unchanged, only `#[cfg(target_os = "macos")]` attributes added). ALL Windows implementations go in a NEW `src-tauri/src/platform_windows.rs`. `lib.rs` command functions are edited only at the few call sites that currently inline OS-specific code.

This REPLACES the earlier "relocate macOS into platform/macos.rs" idea (rejected: too much churn on working macOS code).

## Key Insights
- macOS helpers + command JSON-building already work; goal is to add a Windows twin per OS-divergent function, selected at compile time.
- Two cfg-gated definitions with the same name/signature are fine — only one compiles per target; `generate_handler![]` is unaffected.
- Only 3 command fns inline OS-specific code (`antigravity_launch` setsid, `n9router_start` setsid, `n9router_focus_terminal` osascript). These get the inline block factored into a named seam fn — macOS body identical, just wrapped.
- Command fns that only CALL helpers (`antigravity_list_targets`, `antigravity_status`, `n9router_status`, `n9router_get_logs`) need minimal/no edits if helper names are kept.

## Requirements
### Functional
1. NEW `platform_windows.rs` holds every Windows seam fn (`#[cfg(target_os = "windows")]`), self-contained.
2. macOS seam fns remain in `lib.rs`, bodies unchanged, gained `#[cfg(target_os = "macos")]`.
3. `lib.rs`: add `#[cfg(target_os="windows")] mod platform_windows; ... use platform_windows::*;`.
4. Inline OS blocks in 3 commands → calls to seam fns (`spawn_detached`, `spawn_n9router_piped`, `focus_terminal_impl`).
### Non-functional
5. macOS `cargo build`/`clippy` clean; runtime behavior identical (diff command JSON before/after).
6. Zero `src/**` frontend change in this phase.
7. lib.rs diff limited to: cfg attributes, 1 mod decl + use, 3 call-site swaps, optional `home_dir()` swaps.

## Architecture
```
src-tauri/src/
├── lib.rs               # macOS seam fns (gated) + cross-platform commands + run()
└── platform_windows.rs  # NEW — all Windows seam fns, #[cfg(target_os="windows")]
```
No `platform/mod.rs`, no `platform/macos.rs`. Seam = matching free-fn names across the cfg boundary.

### Seam functions (same name, two cfg-gated impls)
| Fn | macOS (stays in lib.rs) | Windows (platform_windows.rs) |
|----|--------------------------|-------------------------------|
| `app_targets() -> &'static [AppTarget]` | existing `AGY_TARGETS` (gate it) | Windows path table |
| `is_target_installed(&AppTarget)` | existing | probe `.exe` candidates |
| `find_all_pids_for(&AppTarget)` | `pgrep -f` | sysinfo exe match |
| `find_main_pid(&[u32])` | `ps` heuristic | Electron `--type=` heuristic |
| `kill_pid(u32)` | `kill` | `taskkill /F` |
| `kill_tree(u32)` (new) | `kill` (alias) | `taskkill /T /F` |
| `find_n9router_pids()` | `lsof -ti` | `netstat -ano` |
| `find_n9router_bin_inner()` | `which` shell | `which` crate |
| `find_terminal_ancestor(u32)` | `ps` chain | sysinfo chain |
| `spawn_detached(&str)->io::Result<u32>` | setsid block (extracted) | creation_flags |
| `spawn_n9router_piped(&str)->io::Result<Child>` | setsid+pipe (extracted) | CREATE_NO_WINDOW+pipe |
| `focus_terminal_impl(&[u32])->Value` | osascript block (extracted) | Win32 SetForegroundWindow |
| `home_dir()->PathBuf` (new) | `env HOME` | `dirs::home_dir()` |

`AppTarget` struct stays defined in lib.rs (shared shape: `id`,`label`, + fields each OS uses). `bundle_term`/`binary`/`app_path` may be macOS-only fields; Windows impl can ignore or use its own resolution keyed by `id`.

## Related Code Files
- `src-tauri/src/lib.rs` (minimal edits)
- `src-tauri/src/platform_windows.rs` (NEW)

## Implementation Steps
1. Add `#[cfg(target_os = "macos")]` to OS-specific macOS helpers (`AGY_TARGETS`/`app_targets`, `is_target_installed`, `find_all_pids_for`, `is_main_process`, `find_main_pid`, `kill_pid`, `find_n9router_pids`, `find_n9router_bin_inner`, `find_terminal_ancestor`, `KNOWN_TERMINALS`). Bodies untouched.
2. Extract 3 inline OS blocks into `#[cfg(target_os="macos")]` seam fns (`spawn_detached`, `spawn_n9router_piped`, `focus_terminal_impl`) holding the EXACT current code; replace the inline blocks with calls.
3. Add `home_dir()` seam; point `debug_log_path`/`tail_log_file` at it (or gate those 2 fns instead — choose lower-diff option).
4. Add `#[cfg(target_os="windows")] mod platform_windows;` + `use`.
5. Create empty `platform_windows.rs` with all seam fn stubs (`unimplemented!()` placeholders) so structure compiles conceptually; real bodies land in Phases 2-3.
6. macOS `cargo build`; diff command JSON outputs vs pre-change to confirm identical.

## Todo
- [ ] cfg attributes on macOS helpers (bodies unchanged)
- [ ] 3 inline blocks extracted to seam fns (macOS code identical)
- [ ] `home_dir()` seam (lowest-diff variant)
- [ ] `platform_windows.rs` created with seam fn signatures
- [ ] `mod platform_windows` + use wired (windows cfg)
- [ ] macOS build + clippy clean
- [ ] macOS JSON outputs diff = identical
- [ ] macOS smoke test (launch/quit/restart/focus/logs)

## Success Criteria
- macOS app behaves identically; lib.rs diff is small + non-behavioral.
- All Windows code isolated in `platform_windows.rs`.
- Seam fn names resolve per-OS; structure ready for Phases 2-3.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Extraction subtly alters macOS behavior | Low | Med | Move code verbatim into fn; diff JSON outputs |
| Shared `AppTarget` fields mismatch across OS | Med | Low | Keep id/label shared; OS-only fields gated or ignored |
| Forgotten cfg → Windows won't compile | Med | Low | CI Windows build (Phase 6) catches; stub all seam fns |

## Security Considerations
- No new external input. `setsid`/`pre_exec` unsafe stays macOS-gated.
- Extraction is mechanical; no change to spawned binaries or args.

## Next Steps
Phase 2 fills Windows process/launch/kill/port bodies in `platform_windows.rs`.
