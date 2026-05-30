# Phase 3: Win32 Terminal Focus

## Context Links
- Parent: `plan.md` · Depends on: Phase 1 (FocusResult), Phase 2 (PID/ancestor helpers)
- Research: `research/researcher-02-windows-process-mgmt.md` (focus section)
- macOS analog: `lib.rs` `n9router_focus_terminal` + `find_terminal_ancestor`

## Overview
Date: 2026-05-30 · Priority: medium · Status: pending

Implement `focus_terminal(pids)` for Windows using the Win32 API (`windows` crate) instead of `osascript`. Find the top-level window owned by the n9router PID (or its terminal-host ancestor) and bring it to the foreground. Preserve the macOS JSON contract used by `TerminalPanel.jsx`.

## Key Insights
- User decision: "Implement via Win32".
- `TerminalPanel.jsx` reads `{ ok, app, pid }` on success and `{ ok:false, fallback:"log_file", reason }` on failure → must keep these keys.
- Windows Terminal hosts the shell in `WindowsTerminal.exe`; classic consoles use `conhost.exe`. Focusing the host window is the closest analog to macOS terminal activate.
- `SetForegroundWindow` is subject to foreground-lock; may only flash the taskbar button. Acceptable degraded outcome (still returns ok=true if call succeeds, else fallback).

## Requirements
### Functional
1. Walk parent chain (sysinfo) from each n9router PID up to a KNOWN_TERMINALS_WIN host: `WindowsTerminal.exe`, `cmd.exe`, `powershell.exe`, `pwsh.exe`, `conhost.exe`.
2. Find that PID's visible top-level HWND via `EnumWindows` + `GetWindowThreadProcessId`.
3. `ShowWindow(SW_RESTORE)` + `SetForegroundWindow`.
4. Return `FocusResult` mirroring macOS keys.
### Non-functional
5. No console flash. Unsafe Win32 calls isolated + documented.

## Architecture
```rust
const KNOWN_TERMINALS_WIN: &[&str] =
  &["WindowsTerminal.exe","cmd.exe","powershell.exe","pwsh.exe","conhost.exe"];

fn find_terminal_ancestor(start: u32) -> Option<(u32,String)> {
    // sysinfo: climb .parent() up to ~12 hops; match name vs list
}
fn hwnd_for_pid(pid: u32) -> Option<HWND> {
    // EnumWindows callback: GetWindowThreadProcessId == pid
    //   && IsWindowVisible && GetWindowTextLength>0  -> store, stop
}
pub fn focus_terminal(pids: &[u32]) -> FocusResult {
    for pid in pids {
        if let Some((tpid, app)) = find_terminal_ancestor(*pid) {
            if let Some(hwnd) = hwnd_for_pid(tpid) {
                unsafe { ShowWindow(hwnd, SW_RESTORE);
                         let ok = SetForegroundWindow(hwnd).as_bool(); }
                if ok { return FocusResult{ok:true,app:Some(app),pid:Some(tpid),..} }
            }
        }
    }
    FocusResult{ ok:false, fallback:Some("log_file"), reason:Some("No terminal window found"), .. }
}
```
`windows` crate features: `Win32_Foundation`, `Win32_UI_WindowsAndMessaging`, `Win32_System_Threading`.

## Related Code Files
- `src-tauri/src/platform_windows.rs` (focus section — ONLY file touched here)
- `src-tauri/Cargo.toml` (`windows` dep — Phase 4)
- `src-tauri/src/lib.rs` — NOT modified (seam fn `focus_terminal_impl` wired in Phase 1)

## Implementation Steps
1. Add `KNOWN_TERMINALS_WIN` + `find_terminal_ancestor` (sysinfo-based).
2. Implement `EnumWindows` callback storing first matching visible HWND (use a `*mut` userdata or thread-local).
3. Implement `focus_terminal` per pseudocode.
4. Map result into `n9router_focus_terminal` command JSON in lib.rs (Phase 1 wiring): `{ok,app,pid}` / `{ok:false,fallback,reason}`.
5. Build/verify on Windows (Phase 6 CI or local).

## Todo
- [ ] KNOWN_TERMINALS_WIN + ancestor walk
- [ ] EnumWindows HWND-for-PID
- [ ] ShowWindow + SetForegroundWindow
- [ ] FocusResult mapped to existing JSON contract
- [ ] msvc build clean
- [ ] Manual: external n9router in Windows Terminal → focus works/flashes

## Success Criteria
- "Focus Terminal" button (shown when n9router is external + has pid) brings the hosting console/WT to front, or returns graceful `fallback:"log_file"`.
- `TerminalPanel.jsx` toast renders correctly (no code change needed).

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Foreground-lock blocks focus | Med | Low | Accept taskbar flash; still attempt; fallback contract |
| n9router started via launchd-equivalent (Task Scheduler) has no console | Med | Low | Same as macOS: return fallback:"log_file" |
| EnumWindows finds wrong WT window (multi-tab) | Med | Low | Focus host window; tab targeting out of scope |
| unsafe Win32 misuse | Low | Med | Minimal calls, well-known pattern, isolated fn |

## Security Considerations
- No user input into Win32 calls (PID integer + readonly enumeration).
- No elevation required.

## Next Steps
Phase 4 adds the crates these phases depend on and finalizes Tauri/Windows config.
