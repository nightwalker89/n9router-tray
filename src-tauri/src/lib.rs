use std::collections::VecDeque;
use std::io::{BufRead, BufReader};
use std::process::Command;
use std::sync::{Arc, Mutex};
use once_cell::sync::Lazy;
use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tauri_plugin_positioner::{Position, WindowExt};

// ── Constants ────────────────────────────────────────────────────────────────

const N9ROUTER_BIN: &str = "n9router";
const N9ROUTER_PORT: u16 = 20128;
const LOG_RING_CAPACITY: usize = 2000;

// ── AGY App Targets ─────────────────────────────────────────────────────────

struct AppTarget {
    id: &'static str,
    label: &'static str,
    app_path: &'static str,
    binary: &'static str,
    bundle_term: &'static str,
}

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

fn find_target(id: &str) -> Option<&'static AppTarget> {
    AGY_TARGETS.iter().find(|t| t.id == id)
}

/// Known terminal apps (the comm basename we look for in the ppid chain)
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

fn parse_pids(output: &str) -> Vec<u32> {
    output
        .trim()
        .split('\n')
        .filter(|s| !s.is_empty())
        .filter_map(|s| s.trim().parse::<u32>().ok())
        .collect()
}

fn is_main_process(ppid: u32, comm: &str) -> bool {
    ppid == 1
        && comm.contains("/Contents/MacOS/")
        && !comm.contains("Helper")
        && !comm.contains("chrome_crashpad_handler")
}

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

fn find_n9router_bin() -> Option<String> {
    // Try PATH first
    if let Ok(o) = Command::new("which").arg(N9ROUTER_BIN).output() {
        if o.status.success() {
            let p = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if !p.is_empty() { return Some(p); }
        }
    }
    let home = std::env::var("HOME").unwrap_or_default();
    // Check nvm versions
    let nvm_base = format!("{}/.nvm/versions/node", home);
    if let Ok(entries) = std::fs::read_dir(&nvm_base) {
        for entry in entries.flatten() {
            let bin = entry.path().join("bin/n9router");
            if bin.exists() { return Some(bin.to_string_lossy().to_string()); }
        }
    }
    // Static paths
    let candidates = [
        format!("{}/.local/bin/n9router", home),
        "/opt/homebrew/bin/n9router".to_string(),
        "/usr/local/bin/n9router".to_string(),
    ];
    for path in &candidates {
        if std::path::Path::new(path).exists() { return Some(path.clone()); }
    }
    None
}

fn is_n9router_installed() -> bool {
    find_n9router_bin().is_some()
}

/// Tail the last `count` lines from ~/.n9router/log.txt
fn tail_log_file(count: usize) -> Vec<String> {
    let home = std::env::var("HOME").unwrap_or_default();
    let path = format!("{}/.n9router/log.txt", home);
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

// ── Tauri Commands — Antigravity ─────────────────────────────────────────────

#[tauri::command]
fn antigravity_list_targets() -> serde_json::Value {
    let targets: Vec<serde_json::Value> = AGY_TARGETS.iter().map(|t| {
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
    use std::os::unix::process::CommandExt;
    let mut cmd = Command::new(target.binary);
    unsafe {
        cmd.pre_exec(|| { libc::setsid(); Ok(()) });
    }
    let child = cmd
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to launch {}: {e}", target.label))?;
    let pid = child.id();
    drop(child);
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

// ── Tauri Commands — n9router process ────────────────────────────────────────

#[tauri::command]
fn n9router_status() -> serde_json::Value {
    let pid = find_n9router_pid();
    let installed = is_n9router_installed();
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
    })
}

#[tauri::command]
fn n9router_start(force: Option<bool>) -> Result<serde_json::Value, String> {
    use std::os::unix::process::CommandExt;

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

    // Pipe stdout+stderr into our ring buffer
    let ring: Arc<Mutex<VecDeque<String>>> = Arc::new(Mutex::new(VecDeque::with_capacity(LOG_RING_CAPACITY)));
    let ring_clone = ring.clone();

    let mut cmd = Command::new(&n9_bin);
    // New session so n9router outlives tray; but we still pipe its output
    unsafe {
        cmd.pre_exec(|| { libc::setsid(); Ok(()) });
    }
    let mut child = cmd
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start n9router: {e}"))?;

    let pid = child.id();

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

    // Try each pid to find one with a terminal ancestor
    for &pid in &all_pids {
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

// ── App Entry ────────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .invoke_handler(tauri::generate_handler![
            antigravity_list_targets,
            antigravity_status,
            antigravity_launch,
            antigravity_quit,
            antigravity_restart,
            n9router_status,
            n9router_start,
            n9router_stop,
            n9router_get_logs,
            n9router_focus_terminal,
            open_terminal_window,
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            }

            let quit_item = MenuItemBuilder::with_id("quit", "Quit n9router tray").build(app)?;
            let dashboard_item =
                MenuItemBuilder::with_id("dashboard", "Open Dashboard").build(app)?;
            let menu = MenuBuilder::new(app)
                .item(&dashboard_item)
                .separator()
                .item(&quit_item)
                .build()?;

            let tray_icon = TrayIconBuilder::new()
                .icon(Image::from_bytes(include_bytes!("../icons/tray-icon.png"))?)
                .icon_as_template(true)
                .tooltip("n9router tray")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "quit" => { app.exit(0); }
                    "dashboard" => { let _ = open::that("http://localhost:20128/dashboard"); }
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
                                let _ = window.move_window(Position::TrayBottomCenter);
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
