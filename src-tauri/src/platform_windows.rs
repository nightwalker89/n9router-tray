//! Windows platform seam for n9router-tray.
//!
//! Every function here has a matching macOS twin in `lib.rs` (gated with
//! `#[cfg(target_os = "macos")]`). Only one set compiles per target, so the
//! Tauri command functions in `lib.rs` call these by name and get identical
//! JSON shapes regardless of OS.
//!
//! Design notes:
//! - Process detection uses the pure-Rust `sysinfo` crate (no console flash).
//! - Port→PID uses `netstat -ano` spawned with `CREATE_NO_WINDOW`.
//! - Detached launch uses `creation_flags` (no `setsid` on Windows).
//! - Process-tree kill uses `taskkill /T /F` (killing the Electron main pid
//!   does NOT cascade to children on Windows).
//! - Terminal focus uses Win32 `EnumWindows` + `SetForegroundWindow`.

use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};

use sysinfo::{Pid, ProcessRefreshKind, RefreshKind, System};

use super::{AppTarget, N9ROUTER_BIN, N9ROUTER_PORT};

// ── Win32 process-creation flags ─────────────────────────────────────────────
const DETACHED_PROCESS: u32 = 0x0000_0008;
const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

// ── AGY target table (Windows) ───────────────────────────────────────────────
// `app_path` / `binary` are unused on Windows (paths resolved at runtime from
// env vars); `bundle_term` holds the exe basename used for process matching.
const AGY_TARGETS_WIN: &[AppTarget] = &[
    AppTarget {
        id: "antigravity-app",
        label: "AGYv1",
        app_path: "",
        binary: "",
        bundle_term: "Antigravity.exe",
    },
    AppTarget {
        id: "antigravity-app-v2",
        label: "AGYv2",
        app_path: "",
        binary: "",
        bundle_term: "Antigravity.exe",
    },
    AppTarget {
        id: "antigravity-ide",
        label: "AGY IDE",
        app_path: "",
        binary: "",
        bundle_term: "Antigravity IDE.exe",
    },
];

/// Terminal/console host process names we treat as "the terminal".
const KNOWN_TERMINALS_WIN: &[&str] = &[
    "WindowsTerminal.exe",
    "cmd.exe",
    "powershell.exe",
    "pwsh.exe",
    "conhost.exe",
    "alacritty.exe",
    "wezterm-gui.exe",
];

// ── Paths / misc seam fns ────────────────────────────────────────────────────

pub fn home_dir() -> PathBuf {
    dirs::home_dir().unwrap_or_default()
}

pub fn chrono_timestamp() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

pub fn app_targets() -> &'static [AppTarget] {
    AGY_TARGETS_WIN
}

/// Candidate install locations for a given target id.
fn exe_candidates(id: &str) -> Vec<PathBuf> {
    let local = std::env::var("LOCALAPPDATA").ok().map(PathBuf::from);
    let pf = std::env::var("ProgramFiles").ok().map(PathBuf::from);
    let pf86 = std::env::var("ProgramFiles(x86)").ok().map(PathBuf::from);

    let (folder, exe) = match id {
        "antigravity-ide" => ("Antigravity IDE", "Antigravity IDE.exe"),
        // v1 and v2 share the same install folder on Windows; the difference is
        // detected via resources (see `target_variant_ok`).
        _ => ("Antigravity", "Antigravity.exe"),
    };

    let mut out = Vec::new();
    if let Some(base) = &local {
        out.push(base.join("Programs").join(folder).join(exe));
    }
    if let Some(base) = &pf {
        out.push(base.join(folder).join(exe));
    }
    if let Some(base) = &pf86 {
        out.push(base.join(folder).join(exe));
    }
    out
}

/// Resolve the first existing exe for a target id.
fn resolve_exe(id: &str) -> Option<PathBuf> {
    exe_candidates(id).into_iter().find(|p| p.exists())
}

/// Distinguish v1 vs v2 by inspecting the install's `resources` directory.
/// v1 ships `resources\app\bin\antigravity*`; v2 ships only `resources\app.asar`.
fn target_variant_ok(id: &str, exe: &Path) -> bool {
    let dir = match exe.parent() {
        Some(d) => d,
        None => return false,
    };
    let resources = dir.join("resources");
    let bin_dir = resources.join("app").join("bin");
    let has_bin = bin_dir.join("antigravity.cmd").exists()
        || bin_dir.join("antigravity").exists()
        || bin_dir.join("antigravity-ide.cmd").exists();
    let has_asar = resources.join("app.asar").exists();

    match id {
        "antigravity-app" => has_bin,
        "antigravity-app-v2" => has_asar && !has_bin,
        // IDE: presence of the exe is enough.
        "antigravity-ide" => true,
        _ => false,
    }
}

pub fn is_target_installed(target: &AppTarget) -> bool {
    match resolve_exe(target.id) {
        Some(exe) => target_variant_ok(target.id, &exe),
        None => false,
    }
}

pub fn find_target(id: &str) -> Option<&'static AppTarget> {
    AGY_TARGETS_WIN.iter().find(|t| t.id == id)
}

// ── sysinfo helpers ──────────────────────────────────────────────────────────

fn snapshot() -> System {
    System::new_with_specifics(
        RefreshKind::new().with_processes(ProcessRefreshKind::everything()),
    )
}

/// Lowercased name of a process, e.g. "antigravity.exe".
fn proc_name(sys: &System, pid: u32) -> Option<String> {
    sys.process(Pid::from_u32(pid))
        .map(|p| p.name().to_string_lossy().to_ascii_lowercase())
}

// ── Process detection ────────────────────────────────────────────────────────

/// Find all PIDs whose exe basename matches `bundle_term` (e.g. "Antigravity.exe").
pub fn find_all_pids_for(bundle_term: &str) -> Vec<u32> {
    let target = bundle_term.to_ascii_lowercase();
    let sys = snapshot();
    let mut pids: Vec<u32> = Vec::new();
    for (pid, proc_) in sys.processes() {
        let name = proc_.name().to_string_lossy().to_ascii_lowercase();
        let exe_match = proc_
            .exe()
            .map(|e| {
                e.file_name()
                    .map(|n| n.to_string_lossy().to_ascii_lowercase() == target)
                    .unwrap_or(false)
            })
            .unwrap_or(false);
        if name == target || exe_match {
            pids.push(pid.as_u32());
        }
    }
    pids.sort_unstable();
    pids.dedup();
    pids
}

/// Pick the Electron MAIN process: the one whose command line has no `--type=`
/// argument and whose parent is not itself in the candidate set.
pub fn find_main_pid(pids: &[u32]) -> Option<u32> {
    if pids.is_empty() {
        return None;
    }
    let sys = snapshot();
    let pid_set: std::collections::HashSet<u32> = pids.iter().copied().collect();

    let mut fallback: Option<u32> = None;
    for &pid in pids {
        if let Some(proc_) = sys.process(Pid::from_u32(pid)) {
            let has_type = proc_
                .cmd()
                .iter()
                .any(|a| a.to_string_lossy().starts_with("--type="));
            let parent_in_set = proc_
                .parent()
                .map(|pp| pid_set.contains(&pp.as_u32()))
                .unwrap_or(false);
            if !has_type && !parent_in_set {
                return Some(pid);
            }
            if !has_type && fallback.is_none() {
                fallback = Some(pid);
            }
        }
    }
    fallback.or_else(|| pids.first().copied())
}

// ── Kill ─────────────────────────────────────────────────────────────────────

/// Kill a process and its entire tree (`taskkill /T /F`). On Windows killing the
/// Electron main pid does not cascade, so we always kill the tree.
pub fn kill_pid(pid: u32) -> bool {
    Command::new("taskkill")
        .creation_flags(CREATE_NO_WINDOW)
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

// ── Port → PID (n9router) ────────────────────────────────────────────────────

/// Return all PIDs listening on the n9router port via `netstat -ano`.
pub fn find_n9router_pids() -> Vec<u32> {
    let needle = format!(":{}", N9ROUTER_PORT);
    let output = match Command::new("netstat")
        .creation_flags(CREATE_NO_WINDOW)
        .args(["-ano", "-p", "tcp"])
        .output()
    {
        Ok(o) => o,
        Err(_) => return vec![],
    };
    if !output.status.success() {
        return vec![];
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let mut pids: Vec<u32> = Vec::new();
    for line in text.lines() {
        if !line.contains(&needle) || !line.to_ascii_uppercase().contains("LISTENING") {
            continue;
        }
        if let Some(pid) = line.split_whitespace().last().and_then(|s| s.parse::<u32>().ok()) {
            if pid != 0 {
                pids.push(pid);
            }
        }
    }
    pids.sort_unstable();
    pids.dedup();
    pids
}

pub fn find_n9router_pid() -> Option<u32> {
    find_n9router_pids().first().copied()
}

// ── Binary lookup ────────────────────────────────────────────────────────────

pub fn find_n9router_bin() -> Option<String> {
    which::which(N9ROUTER_BIN)
        .ok()
        .map(|p| p.to_string_lossy().to_string())
}

// ── Launch ───────────────────────────────────────────────────────────────────

/// Build a Command, routing `.cmd`/`.bat` shims through `cmd /C` so they execute
/// reliably (npm global bins are typically `.cmd` shims).
fn command_for(program: &str) -> Command {
    let lower = program.to_ascii_lowercase();
    if lower.ends_with(".cmd") || lower.ends_with(".bat") {
        let mut c = Command::new("cmd");
        c.args(["/C", program]);
        c
    } else {
        Command::new(program)
    }
}

/// Launch a GUI app detached and return its pid.
pub fn spawn_detached(target: &AppTarget) -> std::io::Result<u32> {
    let exe = resolve_exe(target.id).ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("{} executable not found", target.label),
        )
    })?;
    let child = Command::new(exe)
        .creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()?;
    let pid = child.id();
    drop(child);
    Ok(pid)
}

/// Spawn n9router with stdout/stderr piped for the log ring, no console window.
pub fn spawn_n9router_piped(bin: &str) -> std::io::Result<Child> {
    command_for(bin)
        .creation_flags(CREATE_NO_WINDOW)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
}

// ── Terminal focus (Win32) ───────────────────────────────────────────────────

use windows::Win32::Foundation::{BOOL, HWND, LPARAM};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetWindowTextLengthW, GetWindowThreadProcessId, IsWindowVisible,
    SetForegroundWindow, ShowWindow, SW_RESTORE,
};

struct FindWindow {
    target_pid: u32,
    hwnd: Option<HWND>,
}

unsafe extern "system" fn enum_windows_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let data = &mut *(lparam.0 as *mut FindWindow);
    let mut pid: u32 = 0;
    GetWindowThreadProcessId(hwnd, Some(&mut pid as *mut u32));
    if pid == data.target_pid
        && IsWindowVisible(hwnd).as_bool()
        && GetWindowTextLengthW(hwnd) > 0
    {
        data.hwnd = Some(hwnd);
        return BOOL(0); // stop enumeration
    }
    BOOL(1) // continue
}

fn hwnd_for_pid(pid: u32) -> Option<HWND> {
    let mut data = FindWindow {
        target_pid: pid,
        hwnd: None,
    };
    unsafe {
        let _ = EnumWindows(
            Some(enum_windows_proc),
            LPARAM(&mut data as *mut FindWindow as isize),
        );
    }
    data.hwnd
}

/// Walk the parent chain from `start` until we hit a known terminal/console host.
/// Returns (pid, display name) of that host.
fn find_terminal_ancestor(start: u32) -> Option<(u32, String)> {
    let sys = snapshot();
    let mut pid = start;
    for _ in 0..16 {
        let name = proc_name(&sys, pid)?;
        if let Some(term) = KNOWN_TERMINALS_WIN
            .iter()
            .find(|t| t.to_ascii_lowercase() == name)
        {
            return Some((pid, term.to_string()));
        }
        match sys.process(Pid::from_u32(pid)).and_then(|p| p.parent()) {
            Some(pp) => {
                let ppid = pp.as_u32();
                if ppid == 0 || ppid == pid {
                    break;
                }
                pid = ppid;
            }
            None => break,
        }
    }
    None
}

/// Bring the terminal that started n9router to the foreground.
pub fn focus_terminal_impl(all_pids: &[u32]) -> serde_json::Value {
    for &pid in all_pids {
        if let Some((tpid, app)) = find_terminal_ancestor(pid) {
            if let Some(hwnd) = hwnd_for_pid(tpid) {
                let ok = unsafe {
                    let _ = ShowWindow(hwnd, SW_RESTORE);
                    SetForegroundWindow(hwnd).as_bool()
                };
                if ok {
                    return serde_json::json!({ "ok": true, "app": app, "pid": tpid });
                }
                return serde_json::json!({
                    "ok": false,
                    "fallback": "log_file",
                    "reason": format!("SetForegroundWindow blocked for {} (pid {})", app, tpid)
                });
            }
        }
    }
    serde_json::json!({
        "ok": false,
        "fallback": "log_file",
        "reason": format!("No terminal window found for {} PIDs (started via Task Scheduler or non-terminal)", all_pids.len()),
    })
}
