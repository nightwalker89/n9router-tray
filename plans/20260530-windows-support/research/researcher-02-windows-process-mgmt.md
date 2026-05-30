# Research 02 — Windows Process & Window Management (Rust)

## Scope
Replicate macOS process logic (`pgrep -f`, `ps -o ppid/comm/command`, `lsof -ti`, `kill`, `setsid`, `osascript` focus) on Windows.

## Process detection — use `sysinfo` crate (pure Rust)
Avoids console flashes from `tasklist`/`wmic`. `sysinfo 0.32`:
- `System::new_all()` / `refresh_processes()` enumerates PIDs.
- Per `Process`: `.name()`, `.exe()` (PathBuf), `.cmd()` (Vec<String> args), `.parent()` (Option<Pid>).
- Match Antigravity by `exe()` path containing the install dir / `Antigravity.exe`.
- **Electron main process detection** (analog of macOS `is_main_process`): Electron spawns helpers with `--type=renderer|gpu-process|utility`. The MAIN process has NO `--type=` in `cmd()` and its parent is NOT another Antigravity process. Pick the PID whose cmdline lacks `--type=` and whose parent isn't in the matched set.

## Port → PID (n9router on :20128)
No `lsof` on Windows. Options:
1. `netstat -ano` parse lines `TCP 0.0.0.0:20128 ... LISTENING <pid>` (last column = PID). Spawn with `CREATE_NO_WINDOW`.
2. Pure-Rust `GetExtendedTcpTable` via `windows` crate (no subprocess) — more code, no flash.
Recommendation: start with `netstat -ano` + `CREATE_NO_WINDOW` (simple, robust); optional later upgrade to IP Helper API.

## Launch detached
macOS uses `setsid()` via `pre_exec`. Windows equivalent:
```rust
use std::os::windows::process::CommandExt;
const DETACHED_PROCESS: u32 = 0x00000008;
const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;
const CREATE_NO_WINDOW: u32 = 0x08000000;
cmd.creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP);
```
- AGY (`.exe`, a GUI app): `DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP`.
- n9router (Node console app whose stdout we pipe): do NOT use DETACHED if we want to keep pipes; use `CREATE_NO_WINDOW` + piped stdio + `CREATE_NEW_PROCESS_GROUP`. Process survives because we `drop(child)` and don't kill the group.
- If AGY launched via `.cmd`/`.bat` shim, must invoke through `cmd /C` or call the `.exe` directly. Prefer the `.exe`.

## Kill — process tree
macOS `kill <pid>` (SIGTERM) on the Electron main; helpers die with parent. Windows: killing the main PID does NOT auto-kill children. Use:
```
taskkill /PID <pid> /T /F
```
`/T` = tree (kills children), `/F` = force. Spawn with `CREATE_NO_WINDOW`. For n9router managed child, `child.kill()` then `taskkill /T` to clean stragglers.

## Terminal focus (replace osascript)
macOS walks ppid chain to find Terminal/iTerm then `osascript ... activate`. Windows:
1. Determine target PID = n9router PID, or walk parent chain (via sysinfo) to a known shell: `WindowsTerminal.exe`, `cmd.exe`, `powershell.exe`, `pwsh.exe`, `conhost.exe`.
2. Find that PID's top-level window via Win32 (`windows` crate):
   - `EnumWindows` → for each HWND `GetWindowThreadProcessId` → match PID.
   - Filter visible top-level windows (`IsWindowVisible`, has title).
3. Restore + focus: `ShowWindow(hwnd, SW_RESTORE)` then `SetForegroundWindow(hwnd)`.
   - `SetForegroundWindow` may be blocked by foreground-lock; mitigate with `AllowSetForegroundWindow` / `keybd_event` ALT trick if needed. Best-effort, fall back to log_file (same contract as macOS `{ ok:false, fallback:"log_file" }`).
- Note: Windows Terminal hosts tabs; focusing the WT window is the closest analog.

## Home / binary path
- `dirs::home_dir()` → `C:\Users\<user>`. Logs: `%USERPROFILE%\.n9router\log.txt`, debug `%USERPROFILE%\.n9tray\debug.log`. n9router writes its own log path — confirm it uses `~` cross-platform (n9router's concern).
- `which` crate replaces `which n9router` shell call; finds `n9router.cmd`/`.exe` on PATH. GUI apps on Windows DO inherit user PATH (unlike macOS GUI), so `fix-path-env` is unneeded on Windows (already unix-only).

## `windows` crate features needed
`Win32_Foundation`, `Win32_UI_WindowsAndMessaging`, `Win32_System_Threading`.

## Risks
- `SetForegroundWindow` focus-stealing restrictions → may only flash taskbar. Acceptable degraded behavior.
- Electron main-PID heuristic could mis-pick; mitigate by also preferring smallest-args / parent-not-in-set.

## References
- `sysinfo` docs, Win32 `EnumWindows`/`SetForegroundWindow`/`ShowWindow`, `taskkill` docs, `std::os::windows::process::CommandExt`.
