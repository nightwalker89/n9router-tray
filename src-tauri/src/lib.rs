use std::collections::VecDeque;
use std::io::{BufRead, BufReader, Write as IoWrite};
use std::process::Command;
use std::sync::{Arc, Mutex};
use once_cell::sync::Lazy;
use serde::Deserialize;
use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tauri_plugin_positioner::{Position, WindowExt};
#[allow(unused_imports)]
use tauri::window::{Effect, EffectState, EffectsBuilder};

// ── Windows platform module ──────────────────────────────────────────────────
// All Windows-specific seam fns live in this separate file. macOS impls stay
// in this file (below), gated with #[cfg(target_os = "macos")]. Only one set
// compiles per target; command functions call the seam fns by name.
#[cfg(target_os = "windows")]
mod platform_windows;
#[cfg(target_os = "windows")]
use platform_windows::*;

// ── Constants ────────────────────────────────────────────────────────────────

const N9ROUTER_BIN: &str = "n9router";
const N9ROUTER_PORT: u16 = 20128;
const LOG_RING_CAPACITY: usize = 2000;

// ── Debug logging ───────────────────────────────────────────────────────────

fn debug_log_path() -> String {
    format!("{}/.n9tray/debug.log", home_dir().to_string_lossy())
}

fn write_debug_log(msg: &str) {
    let path = debug_log_path();
    if let Some(parent) = std::path::Path::new(&path).parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
        let ts = chrono_timestamp();
        let _ = writeln!(f, "[{}] {}", ts, msg);
    }
}

#[cfg(target_os = "macos")]
fn chrono_timestamp() -> String {
    let output = Command::new("date").arg("+%Y-%m-%d %H:%M:%S").output();
    match output {
        Ok(o) => String::from_utf8_lossy(&o.stdout).trim().to_string(),
        Err(_) => "?".to_string(),
    }
}

fn debug(msg: &str) {
    // Always log when called — verbose check is done at call site for optional logs
    write_debug_log(msg);
}

// ── AGY App Targets ─────────────────────────────────────────────────────────

struct AppTarget {
    id: &'static str,
    label: &'static str,
    // Used by the macOS seam (is_target_installed / spawn_detached); on Windows
    // the exe path is resolved dynamically, so these go unread there.
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    app_path: &'static str,
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    binary: &'static str,
    bundle_term: &'static str,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgyRuntimeTarget {
    id: String,
    label: Option<String>,
    name: Option<String>,
    installed: Option<bool>,
    binary: Option<String>,
    process_terms: Option<Vec<String>>,
}

fn runtime_target_label(target: &AgyRuntimeTarget) -> &str {
    target
        .label
        .as_deref()
        .or(target.name.as_deref())
        .unwrap_or(target.id.as_str())
}

fn runtime_target_binary(target: &AgyRuntimeTarget) -> Result<&str, String> {
    if target.installed == Some(false) {
        return Err(format!("{} is not installed", runtime_target_label(target)));
    }
    let binary = target
        .binary
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| format!("{} has no resolved binary path", runtime_target_label(target)))?;
    if !std::path::Path::new(binary).exists() {
        return Err(format!("{} binary not found at {}", runtime_target_label(target), binary));
    }
    Ok(binary)
}

fn runtime_process_terms(target: &AgyRuntimeTarget) -> Vec<String> {
    let mut terms: Vec<String> = target
        .process_terms
        .clone()
        .unwrap_or_default()
        .into_iter()
        .map(|term| term.trim().to_string())
        .filter(|term| !term.is_empty())
        .collect();
    if terms.is_empty() {
        if let Some(binary) = target.binary.as_deref() {
            if let Some(name) = std::path::Path::new(binary).file_name().and_then(|n| n.to_str()) {
                terms.push(name.to_string());
            }
        }
    }
    terms.sort();
    terms.dedup();
    terms
}

fn find_all_pids_for_terms(terms: &[String]) -> Vec<u32> {
    let mut pids: Vec<u32> = terms
        .iter()
        .flat_map(|term| find_all_pids_for(term))
        .collect();
    pids.sort_unstable();
    pids.dedup();
    pids
}

#[cfg(target_os = "macos")]
const AGY_TARGETS: &[AppTarget] = &[
    AppTarget {
        id: "antigravity-app",
        label: "AGYv1",
        app_path: "/Applications/Antigravity.app",
        binary: "/Applications/Antigravity.app/Contents/Resources/app/bin/antigravity",
        bundle_term: "Antigravity.app/Contents/MacOS",
    },
    AppTarget {
        id: "antigravity-app-v2",
        label: "AGYv2",
        app_path: "/Applications/Antigravity.app",
        binary: "/Applications/Antigravity.app/Contents/MacOS/Antigravity",
        bundle_term: "Antigravity.app/Contents/MacOS",
    },
    AppTarget {
        id: "antigravity-ide",
        label: "AGY IDE",
        app_path: "/Applications/Antigravity IDE.app",
        binary: "/Applications/Antigravity IDE.app/Contents/Resources/app/bin/antigravity-ide",
        bundle_term: "Antigravity IDE.app/Contents/MacOS",
    },
];

#[cfg(target_os = "macos")]
fn is_target_installed(target: &AppTarget) -> bool {
    use std::path::Path;
    match target.id {
        "antigravity-app" => {
            Path::new(target.app_path).exists()
                && Path::new("/Applications/Antigravity.app/Contents/Resources/app/bin/antigravity").exists()
        }
        "antigravity-app-v2" => {
            Path::new(target.app_path).exists()
                && Path::new("/Applications/Antigravity.app/Contents/Resources/app.asar").exists()
                && !Path::new("/Applications/Antigravity.app/Contents/Resources/app/bin/antigravity").exists()
        }
        "antigravity-ide" => Path::new(target.app_path).exists(),
        _ => false,
    }
}

#[cfg(target_os = "macos")]
fn find_target(id: &str) -> Option<&'static AppTarget> {
    AGY_TARGETS.iter().find(|t| t.id == id)
}

/// Known terminal apps (the comm basename we look for in the ppid chain)
#[cfg(target_os = "macos")]
const KNOWN_TERMINALS: &[&str] = &[
    "Terminal", "iTerm2", "iTerm", "kitty", "Alacritty", "WezTerm",
    "Warp", "Tabby", "Hyper", "wezterm-gui",
];

// ── Managed process state ────────────────────────────────────────────────────

struct ManagedProcess {
    pid: u32,
    lines: Arc<Mutex<VecDeque<String>>>,
}

/// Global managed n9router process state
static N9_MANAGED: Lazy<Mutex<Option<ManagedProcess>>> =
    Lazy::new(|| Mutex::new(None));

// ── Process Detection ────────────────────────────────────────────────────────

#[cfg(target_os = "macos")]
fn parse_pids(output: &str) -> Vec<u32> {
    output
        .trim()
        .split('\n')
        .filter(|s| !s.is_empty())
        .filter_map(|s| s.trim().parse::<u32>().ok())
        .collect()
}

#[cfg(target_os = "macos")]
fn is_main_process(ppid: u32, comm: &str) -> bool {
    ppid == 1
        && comm.contains("/Contents/MacOS/")
        && !comm.contains("Helper")
        && !comm.contains("chrome_crashpad_handler")
}

#[cfg(target_os = "macos")]
fn find_all_pids_for(bundle_term: &str) -> Vec<u32> {
    let output = match Command::new("pgrep")
        .args(["-f", bundle_term])
        .output()
    {
        Ok(o) => o,
        Err(_) => return vec![],
    };
    if !output.status.success() {
        return vec![];
    }
    parse_pids(&String::from_utf8_lossy(&output.stdout))
}

#[cfg(target_os = "macos")]
fn find_main_pid(pids: &[u32]) -> Option<u32> {
    if pids.is_empty() {
        return None;
    }
    let pid_args: Vec<String> = pids.iter().map(|p| p.to_string()).collect();
    let ps_arg = pid_args.join(",");
    let output = Command::new("ps")
        .args(["-o", "pid=,ppid=,comm=", "-p", &ps_arg])
        .output()
        .ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut parent_pids: Vec<u32> = vec![];
    for line in stdout.trim().split('\n') {
        let parts: Vec<&str> = line.trim().splitn(3, char::is_whitespace).collect();
        if parts.len() < 3 { continue; }
        let pid: u32 = parts[0].trim().parse().unwrap_or(0);
        let ppid: u32 = parts[1].trim().parse().unwrap_or(0);
        let comm = parts[2].trim();
        if is_main_process(ppid, comm) { return Some(pid); }
        if ppid != 1 && !pids.contains(&ppid) { parent_pids.push(ppid); }
    }
    if parent_pids.is_empty() { return None; }
    let parent_arg: Vec<String> = parent_pids.iter().map(|p| p.to_string()).collect();
    let parent_ps = Command::new("ps")
        .args(["-o", "pid=,ppid=,comm=", "-p", &parent_arg.join(",")])
        .output()
        .ok()?;
    let parent_stdout = String::from_utf8_lossy(&parent_ps.stdout);
    for line in parent_stdout.trim().split('\n') {
        let parts: Vec<&str> = line.trim().splitn(3, char::is_whitespace).collect();
        if parts.len() < 3 { continue; }
        let pid: u32 = parts[0].trim().parse().unwrap_or(0);
        let ppid: u32 = parts[1].trim().parse().unwrap_or(0);
        let comm = parts[2].trim();
        if is_main_process(ppid, comm) { return Some(pid); }
    }
    None
}

#[cfg(target_os = "macos")]
fn kill_pid(pid: u32) -> bool {
    Command::new("kill")
        .arg(pid.to_string())
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

// ── n9router helpers ─────────────────────────────────────────────────────────

/// Return ALL PIDs listening on n9router port, preferring ones with a terminal ancestor.
/// Multiple PIDs can appear when e.g. Chrome and a terminal both hold a process on the port.
#[cfg(target_os = "macos")]
fn find_n9router_pids() -> Vec<u32> {
    let output = match Command::new("lsof")
        .args(["-ti", &format!(":{}", N9ROUTER_PORT)])
        .output()
    {
        Ok(o) if o.status.success() => o,
        _ => return vec![],
    };
    String::from_utf8_lossy(&output.stdout)
        .trim()
        .split('\n')
        .filter_map(|s| s.trim().parse::<u32>().ok())
        .collect()
}

/// Return a single PID for status/stop: prefer the terminal-started one.
#[cfg(target_os = "macos")]
fn find_n9router_pid() -> Option<u32> {
    let pids = find_n9router_pids();
    if pids.is_empty() { return None; }
    // Prefer a pid that has a terminal ancestor
    for &p in &pids {
        if find_terminal_ancestor(p).is_some() {
            return Some(p);
        }
    }
    // Fall back to first
    pids.into_iter().next()
}

// ── Cached n9router binary path ─────────────────────────────────────────────

#[cfg(target_os = "macos")]
static N9_BIN_CACHE: Lazy<Mutex<Option<String>>> = Lazy::new(|| {
    let bin = find_n9router_bin_inner();
    debug(&format!("n9router binary resolved: {:?}", bin));
    Mutex::new(bin)
});

#[cfg(target_os = "macos")]
fn find_n9router_bin_inner() -> Option<String> {
    let path_env = std::env::var("PATH").unwrap_or_default();
    debug(&format!("find_n9router_bin: PATH={}", path_env));

    // fix_path_env::fix() already injected the shell's $PATH, so `which` works
    if let Ok(o) = Command::new("which").arg(N9ROUTER_BIN).output() {
        let stdout = String::from_utf8_lossy(&o.stdout).trim().to_string();
        debug(&format!("find_n9router_bin: which status={} stdout={}", o.status.success(), stdout));
        if o.status.success() && !stdout.is_empty() {
            return Some(stdout);
        }
    }

    debug("find_n9router_bin: NOT FOUND");
    None
}

#[cfg(target_os = "macos")]
fn find_n9router_bin() -> Option<String> {
    N9_BIN_CACHE.lock().unwrap().clone()
}

fn get_n9router_version(bin_path: &str) -> Option<String> {
    Command::new(bin_path)
        .arg("--version")
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| {
            let raw = String::from_utf8_lossy(&o.stdout).trim().to_string();
            // Strip prefix like "n9router v" or "n9router " to get just the version
            let v = raw.strip_prefix("n9router").unwrap_or(&raw).trim();
            let v = v.strip_prefix('v').unwrap_or(v);
            v.to_string()
        })
        .filter(|v| !v.is_empty())
}

/// Tail the last `count` lines from ~/.n9router/log.txt
fn tail_log_file(count: usize) -> Vec<String> {
    let path = format!("{}/.n9router/log.txt", home_dir().to_string_lossy());
    let content = match std::fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return vec![format!("[n9router] Log file not found: {}", path)],
    };
    let lines: Vec<String> = content.lines().map(|l| l.to_string()).collect();
    lines.into_iter().rev().take(count).rev().collect()
}

/// Walk ppid chain from `pid`, return the first terminal app name found.
/// Uses separate `ps -o ppid=` and `ps -o command=` calls to get the FULL
/// (non-truncated) command path — macOS `comm=` truncates at 16 chars.
#[cfg(target_os = "macos")]
fn find_terminal_ancestor(start_pid: u32) -> Option<String> {
    let mut pid = start_pid;
    for _ in 0..12 {
        // Step 1: get parent PID
        let ppid_out = Command::new("ps")
            .args(["-o", "ppid=", "-p", &pid.to_string()])
            .output()
            .ok()?;
        let ppid_str = String::from_utf8_lossy(&ppid_out.stdout);
        let ppid: u32 = ppid_str.trim().parse().unwrap_or(0);

        // Step 2: get full command line of current pid (not truncated)
        let cmd_out = Command::new("ps")
            .args(["-o", "command=", "-p", &pid.to_string()])
            .output()
            .ok()?;
        let cmd = String::from_utf8_lossy(&cmd_out.stdout);
        let cmd = cmd.trim();

        if !cmd.is_empty() {
            // Extract basename of first token (before any space/args)
            let exe = cmd.split_whitespace().next().unwrap_or(cmd);
            let basename = exe.rsplit('/').next().unwrap_or(exe);
            for &term in KNOWN_TERMINALS {
                if basename.eq_ignore_ascii_case(term) {
                    return Some(term.to_string());
                }
            }
            // Also check if the full path contains a .app bundle name
            for &term in KNOWN_TERMINALS {
                if cmd.contains(&format!("{}.app", term)) {
                    return Some(term.to_string());
                }
            }
        }

        if ppid == 0 || ppid == 1 { break; }
        pid = ppid;
    }
    None
}

// ── macOS platform seam ─────────────────────────────────────────────────────
// These fns hold the macOS-specific code that the command functions call.
// Windows twins with identical names/signatures live in platform_windows.rs.
// Bodies below are the exact code previously inlined in the commands.

#[cfg(target_os = "macos")]
fn home_dir() -> std::path::PathBuf {
    std::path::PathBuf::from(std::env::var("HOME").unwrap_or_default())
}

#[cfg(target_os = "macos")]
fn app_targets() -> &'static [AppTarget] {
    AGY_TARGETS
}

/// Launch a GUI app detached (new session) and return its pid.
#[cfg(target_os = "macos")]
fn spawn_detached(target: &AppTarget) -> std::io::Result<u32> {
    use std::os::unix::process::CommandExt;
    let mut cmd = Command::new(target.binary);
    unsafe {
        cmd.pre_exec(|| { libc::setsid(); Ok(()) });
    }
    let child = cmd
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()?;
    let pid = child.id();
    drop(child);
    Ok(pid)
}

/// Launch a resolved GUI app binary from n9router metadata.
#[cfg(target_os = "macos")]
fn spawn_detached_binary(binary: &str) -> std::io::Result<u32> {
    use std::os::unix::process::CommandExt;
    let mut cmd = Command::new(binary);
    unsafe {
        cmd.pre_exec(|| { libc::setsid(); Ok(()) });
    }
    let child = cmd
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()?;
    let pid = child.id();
    drop(child);
    Ok(pid)
}

/// Spawn n9router in a new session with stdout/stderr piped for the log ring.
#[cfg(target_os = "macos")]
fn spawn_n9router_piped(bin: &str) -> std::io::Result<std::process::Child> {
    use std::os::unix::process::CommandExt;
    let mut cmd = Command::new(bin);
    // New session so n9router outlives tray; but we still pipe its output
    unsafe {
        cmd.pre_exec(|| { libc::setsid(); Ok(()) });
    }
    cmd.stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
}

/// Bring the terminal that started n9router to the foreground.
#[cfg(target_os = "macos")]
fn focus_terminal_impl(all_pids: &[u32]) -> serde_json::Value {
    // Try each pid to find one with a terminal ancestor
    for &pid in all_pids {
        if let Some(app_name) = find_terminal_ancestor(pid) {
            let script = format!("tell application \"{}\" to activate", app_name);
            let result = Command::new("osascript")
                .arg("-e")
                .arg(&script)
                .output();
            match result {
                Ok(o) if o.status.success() => {
                    return serde_json::json!({ "ok": true, "app": app_name, "pid": pid });
                }
                Ok(o) => {
                    let err = String::from_utf8_lossy(&o.stderr).to_string();
                    return serde_json::json!({
                        "ok": false,
                        "fallback": "log_file",
                        "reason": format!("AppleScript failed: {}", err)
                    });
                }
                Err(e) => {
                    return serde_json::json!({
                        "ok": false,
                        "fallback": "log_file",
                        "reason": format!("osascript error: {}", e)
                    });
                }
            }
        }
    }
    serde_json::json!({
        "ok": false,
        "fallback": "log_file",
        "reason": format!("No terminal ancestor found in {} PIDs (started via launchd or non-terminal)", all_pids.len()),
    })
}

// ── Tauri Commands — Antigravity ─────────────────────────────────────────────

#[tauri::command]
fn antigravity_list_targets() -> serde_json::Value {
    let targets: Vec<serde_json::Value> = app_targets().iter().map(|t| {
        let installed = is_target_installed(t);
        let all_pids = if installed { find_all_pids_for(t.bundle_term) } else { vec![] };
        let running = !all_pids.is_empty();
        let main_pid: Option<u32> = if running {
            find_main_pid(&all_pids).or_else(|| all_pids.first().copied())
        } else {
            None
        };
        serde_json::json!({
            "id": t.id,
            "label": t.label,
            "installed": installed,
            "running": running,
            "pid": main_pid,
            "all_pids": all_pids,
        })
    }).collect();
    serde_json::json!({ "targets": targets })
}

#[tauri::command]
fn antigravity_status(target_id: String) -> serde_json::Value {
    let target = match find_target(&target_id) {
        Some(t) => t,
        None => return serde_json::json!({ "error": "unknown target", "running": false, "installed": false }),
    };
    let installed = is_target_installed(target);
    let all_pids = if installed { find_all_pids_for(target.bundle_term) } else { vec![] };
    let running = !all_pids.is_empty();
    let main_pid: Option<u32> = if running {
        find_main_pid(&all_pids).or_else(|| all_pids.first().copied())
    } else {
        None
    };
    serde_json::json!({ "id": target.id, "running": running, "pid": main_pid, "all_pids": all_pids, "installed": installed })
}

#[tauri::command]
fn antigravity_launch(target_id: String) -> Result<serde_json::Value, String> {
    let target = find_target(&target_id)
        .ok_or_else(|| format!("Unknown target: {}", target_id))?;
    if !is_target_installed(target) {
        return Err(format!("{} is not installed", target.label));
    }
    let pid = spawn_detached(target)
        .map_err(|e| format!("Failed to launch {}: {e}", target.label))?;
    Ok(serde_json::json!({ "ok": true, "pid": pid, "target": target.id }))
}

#[tauri::command]
fn antigravity_launch_resolved(target: AgyRuntimeTarget) -> Result<serde_json::Value, String> {
    let binary = runtime_target_binary(&target)?;
    let pid = spawn_detached_binary(binary)
        .map_err(|e| format!("Failed to launch {}: {e}", runtime_target_label(&target)))?;
    Ok(serde_json::json!({ "ok": true, "pid": pid, "target": target.id }))
}

#[tauri::command]
fn antigravity_quit(target_id: String) -> Result<serde_json::Value, String> {
    let target = find_target(&target_id)
        .ok_or_else(|| format!("Unknown target: {}", target_id))?;
    let all_pids = find_all_pids_for(target.bundle_term);
    if all_pids.is_empty() {
        return Ok(serde_json::json!({ "ok": true, "method": "not_running", "target": target.id }));
    }
    let killed_pid = if let Some(main_pid) = find_main_pid(&all_pids) {
        kill_pid(main_pid);
        main_pid
    } else {
        for pid in &all_pids { kill_pid(*pid); }
        *all_pids.first().unwrap()
    };
    Ok(serde_json::json!({ "ok": true, "method": "kill_main", "pid": killed_pid, "target": target.id }))
}

#[tauri::command]
fn antigravity_restart(target_id: String) -> Result<serde_json::Value, String> {
    let target = find_target(&target_id)
        .ok_or_else(|| format!("Unknown target: {}", target_id))?;
    let all_pids = find_all_pids_for(target.bundle_term);
    if !all_pids.is_empty() {
        if let Some(main_pid) = find_main_pid(&all_pids) {
            kill_pid(main_pid);
        } else {
            for pid in &all_pids { kill_pid(*pid); }
        }
        std::thread::sleep(std::time::Duration::from_millis(2000));
    }
    antigravity_launch(target_id)
}

#[tauri::command]
fn antigravity_restart_resolved(target: AgyRuntimeTarget) -> Result<serde_json::Value, String> {
    let terms = runtime_process_terms(&target);
    let all_pids = find_all_pids_for_terms(&terms);
    if !all_pids.is_empty() {
        if let Some(main_pid) = find_main_pid(&all_pids) {
            kill_pid(main_pid);
        } else {
            for pid in &all_pids { kill_pid(*pid); }
        }
        std::thread::sleep(std::time::Duration::from_millis(2000));
    }
    antigravity_launch_resolved(target)
}

// ── Tauri Commands — n9router process ────────────────────────────────────────

#[tauri::command]
fn n9router_status() -> serde_json::Value {
    let pid = find_n9router_pid();
    let bin_path = find_n9router_bin();
    let installed = bin_path.is_some();
    let version = bin_path.as_deref().and_then(get_n9router_version);
    // Check if the running pid matches our managed process
    let managed = {
        let guard = N9_MANAGED.lock().unwrap();
        guard.as_ref().map(|m| m.pid) == pid && pid.is_some()
    };
    serde_json::json!({
        "running": pid.is_some(),
        "pid": pid,
        "installed": installed,
        "managed": managed,
        "version": version,
        "binPath": bin_path,
    })
}

#[tauri::command]
fn n9router_start(force: Option<bool>) -> Result<serde_json::Value, String> {
    let force = force.unwrap_or(false);

    if force {
        let pids = find_n9router_pids();
        for pid in &pids {
            kill_pid(*pid);
        }
        if !pids.is_empty() {
            std::thread::sleep(std::time::Duration::from_millis(500));
        }
        // Clear managed state since we killed it
        let mut guard = N9_MANAGED.lock().unwrap();
        *guard = None;
        drop(guard);
    } else if let Some(pid) = find_n9router_pid() {
        return Ok(serde_json::json!({ "ok": true, "method": "already_running", "pid": pid }));
    }
    let n9_bin = find_n9router_bin()
        .ok_or_else(|| "n9router CLI not found. Install with: npm i -g n9router".to_string())?;

    debug(&format!("n9router_start: binary={}, force={}", n9_bin, force));

    // Pipe stdout+stderr into our ring buffer
    let ring: Arc<Mutex<VecDeque<String>>> = Arc::new(Mutex::new(VecDeque::with_capacity(LOG_RING_CAPACITY)));
    let ring_clone = ring.clone();

    let mut child = spawn_n9router_piped(&n9_bin)
        .map_err(|e| {
            let msg = format!("Failed to start n9router: {e}");
            debug(&msg);
            msg
        })?;

    let pid = child.id();
    debug(&format!("n9router_start: spawned pid={}", pid));

    // Drain stdout in a background thread
    if let Some(stdout) = child.stdout.take() {
        let r = ring_clone.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().flatten() {
                let mut buf = r.lock().unwrap();
                if buf.len() >= LOG_RING_CAPACITY { buf.pop_front(); }
                buf.push_back(line);
            }
        });
    }
    // Drain stderr in another thread
    if let Some(stderr) = child.stderr.take() {
        let r = ring_clone.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().flatten() {
                let mut buf = r.lock().unwrap();
                if buf.len() >= LOG_RING_CAPACITY { buf.pop_front(); }
                buf.push_back(format!("[stderr] {}", line));
            }
        });
    }

    // Store managed process state (drop child handle so process continues)
    drop(child);
    {
        let mut guard = N9_MANAGED.lock().unwrap();
        *guard = Some(ManagedProcess { pid, lines: ring });
    }

    Ok(serde_json::json!({ "ok": true, "pid": pid, "managed": true }))
}

#[tauri::command]
fn n9router_stop() -> Result<serde_json::Value, String> {
    let pid = find_n9router_pid();
    match pid {
        None => Ok(serde_json::json!({ "ok": true, "method": "not_running" })),
        Some(p) => {
            kill_pid(p);
            // Clear managed state
            let mut guard = N9_MANAGED.lock().unwrap();
            *guard = None;
            Ok(serde_json::json!({ "ok": true, "method": "sigterm", "pid": p }))
        }
    }
}

/// Return last `count` log lines.
/// - If n9router is managed by the tray: return from ring buffer
/// - Otherwise: tail ~/.n9router/log.txt
#[tauri::command]
fn n9router_get_logs(count: Option<usize>) -> serde_json::Value {
    let count = count.unwrap_or(200).min(LOG_RING_CAPACITY);
    let all_pids = find_n9router_pids();
    let any_running = !all_pids.is_empty();

    let guard = N9_MANAGED.lock().unwrap();
    let managed_pid = guard.as_ref().map(|m| m.pid);
    let managed_matches = managed_pid.map(|mp| all_pids.contains(&mp)).unwrap_or(false);

    if managed_matches {
        // Return from ring buffer
        let buf = guard.as_ref().unwrap().lines.lock().unwrap();
        let lines: Vec<String> = buf.iter().rev().take(count).rev().cloned().collect();
        serde_json::json!({
            "managed": true,
            "pid": managed_pid,
            "lines": lines,
            "source": "managed",
        })

    } else {
        // External process — tail log file
        drop(guard);
        let first_pid = all_pids.first().copied();
        let lines = tail_log_file(count);
        serde_json::json!({
            "managed": false,
            "pid": first_pid,
            "running": any_running,
            "lines": lines,
            "source": "log_file",
        })
    }
}

/// If n9router is externally managed, try to find and focus its parent terminal.
/// Tries ALL pids on the port — prefers the one with a terminal ancestor.
/// Returns { ok, app } on success or { ok: false, fallback: "log_file", reason } on failure.
#[tauri::command]
fn n9router_focus_terminal() -> serde_json::Value {
    let all_pids = find_n9router_pids();
    if all_pids.is_empty() {
        return serde_json::json!({ "ok": false, "reason": "n9router not running" });
    }
    focus_terminal_impl(&all_pids)
}

/// Open (or focus) the floating terminal log window
#[tauri::command]
fn open_terminal_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("terminal") {
        let _ = win.show();
        let _ = win.set_focus();
        return Ok(());
    }

    let _win = tauri::WebviewWindowBuilder::new(
        &app,
        "terminal",
        tauri::WebviewUrl::App("index.html#terminal".into()),
    )
    .title("n9router Logs")
    .inner_size(700.0, 450.0)
    .min_inner_size(480.0, 300.0)
    .resizable(true)
    .decorations(true)
    .always_on_top(false)
    .center()
    .build()
    .map_err(|e| format!("Failed to open terminal window: {e}"))?;

    Ok(())
}

// ── Activity HUD floating window ──────────────────────────────────────────────

/// Build the glossy floating HUD. Effects are cfg-gated: macOS vibrancy
/// (HudWindow), Windows 11 Mica (no-op/ignored on Win10 → opaque CSS fallback).
fn build_hud_window(app: &tauri::AppHandle) -> Result<(), String> {
    let builder = tauri::WebviewWindowBuilder::new(
        app,
        "hud",
        tauri::WebviewUrl::App("index.html#hud".into()),
    )
    .title("Activity")
    .inner_size(440.0, 600.0)
    .min_inner_size(320.0, 400.0)
    .resizable(true)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .shadow(false);

    // macOS: no native vibrancy — its square NSVisualEffect layer leaks past the
    // rounded CSS corners. The CSS glass (.hud-root) is the surface instead, which
    // also keeps the opacity slider authoritative. Corners stay clean.
    // Windows 11 rounds windows via DWM, so Mica clips correctly there.
    #[cfg(target_os = "windows")]
    let builder = builder.effects(EffectsBuilder::new().effect(Effect::Mica).build());

    let win = builder
        .build()
        .map_err(|e| format!("Failed to open HUD window: {e}"))?;

    // Default anchor top-right; JS restores persisted position on mount.
    let _ = win.move_window(Position::TopRight);
    Ok(())
}

#[tauri::command]
fn open_hud_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("hud") {
        let _ = win.show();
        let _ = win.set_focus();
        return Ok(());
    }
    build_hud_window(&app)
}

#[tauri::command]
fn close_hud_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("hud") {
        let _ = win.hide();
    }
    Ok(())
}

#[tauri::command]
fn toggle_hud_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("hud") {
        if win.is_visible().unwrap_or(false) {
            let _ = win.hide();
        } else {
            let _ = win.show();
            let _ = win.set_focus();
        }
        return Ok(());
    }
    build_hud_window(&app)
}

// ── App Entry ────────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Fix PATH for macOS GUI apps that don't inherit shell environment
    #[cfg(unix)]
    let _ = fix_path_env::fix();

    let builder = tauri::Builder::default();

    // Windows: relaunching focuses the existing tray instance instead of opening
    // a second copy. Must be registered before any other plugin. Compiled out on
    // macOS, so the builder chain below is behaviorally unchanged there.
    #[cfg(target_os = "windows")]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }));

    builder
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .invoke_handler(tauri::generate_handler![
            antigravity_list_targets,
            antigravity_status,
            antigravity_launch,
            antigravity_launch_resolved,
            antigravity_quit,
            antigravity_restart,
            antigravity_restart_resolved,
            n9router_status,
            n9router_start,
            n9router_stop,
            n9router_get_logs,
            n9router_focus_terminal,
            open_terminal_window,
            open_hud_window,
            close_hud_window,
            toggle_hud_window,
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            }

            let quit_item = MenuItemBuilder::with_id("quit", "Quit n9router Tray").build(app)?;
            let dashboard_item =
                MenuItemBuilder::with_id("dashboard", "Open Dashboard").build(app)?;
            let hud_item =
                MenuItemBuilder::with_id("hud", "Activity HUD").build(app)?;
            let menu = MenuBuilder::new(app)
                .item(&dashboard_item)
                .item(&hud_item)
                .separator()
                .item(&quit_item)
                .build()?;

            // Template (monochrome) rendering is macOS-only; Windows uses the colored icon.
            #[cfg(target_os = "macos")]
            let tray_builder = TrayIconBuilder::new()
                .icon(Image::from_bytes(include_bytes!("../icons/tray-icon.png"))?)
                .icon_as_template(true);
            #[cfg(not(target_os = "macos"))]
            let tray_builder = TrayIconBuilder::new()
                .icon(Image::from_bytes(include_bytes!("../icons/icon.png"))?);
            let tray_icon = tray_builder
                .tooltip("n9router Tray")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "quit" => { app.exit(0); }
                    "dashboard" => { let _ = open::that("http://localhost:20128/dashboard"); }
                    "hud" => { let _ = toggle_hud_window(app.clone()); }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    tauri_plugin_positioner::on_tray_event(tray.app_handle(), &event);
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                // macOS menu bar is at the top → drop the panel
                                // down from the tray (existing behavior).
                                #[cfg(target_os = "macos")]
                                let _ = window.move_window(Position::TrayBottomCenter);
                                // Windows taskbar is at the bottom → place the panel
                                // ABOVE the tray and constrain it to the monitor so it
                                // never spills off-screen (e.g. past the right edge).
                                #[cfg(not(target_os = "macos"))]
                                let _ = window.move_window_constrained(Position::TrayCenter);
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            app.manage(tray_icon);

            if let Some(window) = app.get_webview_window("main") {
                let win = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::Focused(false) = event {
                        let _ = win.hide();
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
