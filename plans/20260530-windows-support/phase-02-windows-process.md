# Phase 2: Windows Process / Launch / Kill / Port

## Context Links
- Parent: `plan.md` · Depends on: Phase 1 (interface)
- Research: `research/researcher-02-windows-process-mgmt.md`, `research/researcher-03-antigravity-cli-ci.md`

## Overview
Date: 2026-05-30 · Priority: high · Status: pending

Implement Windows seam fns in the NEW `platform_windows.rs` (all `#[cfg(target_os = "windows")]`): Antigravity target resolution, process detection (sysinfo), detached launch (creation_flags), tree kill (taskkill), port→PID (netstat), binary/home lookup. Same fn names as the macOS seam in `lib.rs` so commands return identical JSON. No edits to macOS code in this phase.

## Key Insights
- `sysinfo` avoids console-flash of `tasklist`/`wmic`.
- Electron MAIN process = no `--type=` arg + parent not in matched set (analog of macOS `is_main_process`).
- Killing Electron main does NOT cascade on Windows → must `taskkill /T /F`.
- GUI apps inherit user PATH on Windows → no `fix-path-env` needed.

## Requirements
### Functional
1. `app_targets()` → AGYv1/AGYv2/AGY-IDE with Windows path resolution.
2. `is_target_installed(id)` probes candidate paths.
3. `find_pids_for(id)` via sysinfo exe-path match.
4. `find_main_pid(pids)` Electron-main heuristic.
5. `find_pids_on_port(20128)` via `netstat -ano` (CREATE_NO_WINDOW).
6. `launch_detached(exe)` via creation_flags (DETACHED|NEW_GROUP).
7. `spawn_piped(bin)` for n9router (CREATE_NO_WINDOW, piped stdout/stderr, survives via drop).
8. `kill_process(pid)` (taskkill /F) + `kill_process_tree(pid)` (taskkill /T /F).
9. `find_n9router_bin()` via `which` crate; `home_dir()` via `dirs`.
### Non-functional
10. No visible console windows during normal operation.
11. `cargo check --target x86_64-pc-windows-msvc` clean.

## Architecture — Windows target table
```rust
// best-effort defaults; confirm w/ user (plan-questions.md Q1)
fn candidates(id) -> Vec<PathBuf> {
  let la = env::var("LOCALAPPDATA"); let pf = env::var("ProgramFiles");
  match id {
   "antigravity-app" | "antigravity-app-v2" => vec![
     la\Programs\Antigravity\Antigravity.exe,
     pf\Antigravity\Antigravity.exe ],
   "antigravity-ide" => vec![
     la\Programs\Antigravity IDE\Antigravity IDE.exe,
     pf\Antigravity IDE\Antigravity IDE.exe ],
  }
}
// v1 vs v2: inspect <dir>\resources\app\bin\antigravity* (v1) vs app.asar only (v2)
```
Launch target = first existing `.exe`. Detection match = process `exe()` path equals/within that dir.

## Detached launch / kill flags
```rust
use std::os::windows::process::CommandExt;
const DETACHED_PROCESS: u32 = 0x0000_0008;
const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

// AGY GUI
Command::new(exe).creation_flags(DETACHED_PROCESS|CREATE_NEW_PROCESS_GROUP)
  .stdin/out/err(null).spawn()
// n9router console (keep pipes)
Command::new(bin).creation_flags(CREATE_NO_WINDOW)
  .stdout(piped).stderr(piped).spawn()
// kill
Command::new("taskkill").creation_flags(CREATE_NO_WINDOW)
  .args(["/PID", &pid, "/T", "/F"]).output()
```

## Port → PID
```
netstat -ano  ->  filter lines containing ":20128" + "LISTENING"  ->  last whitespace col = PID
```
Spawn with CREATE_NO_WINDOW. Dedup PIDs.

## Related Code Files
- `src-tauri/src/platform_windows.rs` (new — all bodies; ONLY file touched here)
- `src-tauri/Cargo.toml` (deps — Phase 4)
- `src-tauri/src/lib.rs` — NOT modified in this phase (seam + mod decl done in Phase 1)

## Implementation Steps
1. Add `find_main_pid`: collect (pid, parent, cmd) via sysinfo; pick pid with no `--type=` and parent ∉ matched set; fallback first.
2. Implement target candidates + `is_target_installed` + `launch_binary_for`.
3. Implement `find_pids_for` (sysinfo exe-path contains target dir).
4. Implement `find_pids_on_port` (netstat parse).
5. Implement `launch_detached`, `spawn_piped`, `kill_process`, `kill_process_tree`.
6. Implement `find_n9router_bin` (which), `home_dir` (dirs).
7. `cargo check` for msvc target (or via CI Phase 6 if no local Windows).

## Todo
- [ ] Target table + path probing
- [ ] sysinfo detection + main-pid heuristic
- [ ] netstat port parser
- [ ] creation_flags launch (GUI + piped)
- [ ] taskkill kill/tree
- [ ] which/dirs path helpers
- [ ] msvc cargo check clean

## Success Criteria
- Commands return same JSON keys as macOS (`running`,`pid`,`all_pids`,`installed`,...).
- No console flashes.
- AGY launch/restart/quit + n9router start/stop/logs functional on Windows.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Wrong AGY paths | Med | High | Probe multiple candidates; confirm w/ user; installed:false if none |
| Main-PID misdetect | Med | Med | Heuristic + fallback; quit uses /T tree kill anyway |
| netstat locale/format diff | Low | Med | Parse by ":port"+LISTENING + trailing int, locale-agnostic |
| n9router child dies with tray | Med | Med | drop(child) + no group kill; verify survives |

## Security Considerations
- `taskkill`/`netstat` args use fixed flags + integer PID (no injection).
- Binary paths from env-derived known dirs, not user input.
- `CREATE_NO_WINDOW` prevents stray console exposure.

## Next Steps
Phase 3 adds Win32 terminal focus to complete `windows.rs`.
