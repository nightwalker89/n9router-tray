use std::process::Command;
use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tauri_plugin_positioner::{Position, WindowExt};

// ── Constants ────────────────────────────────────────────────────────────────

const ANTIGRAVITY_APP_PATH: &str = "/Applications/Antigravity.app";
const ANTIGRAVITY_MACOS_BIN: &str = "/Applications/Antigravity.app/Contents/MacOS/Antigravity";

/// pgrep search term: matches processes whose path contains this string
const ANTIGRAVITY_BUNDLE_TERM: &str = "Antigravity.app/Contents/MacOS";

// ── Process Detection (mirrors ide-launcher.ts logic) ───────────────────────

/// Parse pgrep output into a Vec of PIDs
fn parse_pids(output: &str) -> Vec<u32> {
    output
        .trim()
        .split('\n')
        .filter(|s| !s.is_empty())
        .filter_map(|s| s.trim().parse::<u32>().ok())
        .collect()
}

/// Check if a process line is the main Electron process, not a helper.
/// Mirrors _isMainProcess: ppid == 1, path contains /Contents/MacOS/,
/// does NOT contain "Helper" or "chrome_crashpad_handler".
fn is_main_process(ppid: u32, comm: &str) -> bool {
    ppid == 1
        && comm.contains("/Contents/MacOS/")
        && !comm.contains("Helper")
        && !comm.contains("chrome_crashpad_handler")
}

/// Find all PIDs running Antigravity via `pgrep -f`
fn find_all_pids() -> Vec<u32> {
    let output = match Command::new("pgrep")
        .args(["-f", ANTIGRAVITY_BUNDLE_TERM])
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

/// Find the main Electron process PID from a list of candidate PIDs.
/// Uses `ps -o pid=,ppid=,comm=` — mirrors _findMainProcessPid().
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
        if parts.len() < 3 {
            continue;
        }
        let pid: u32 = parts[0].trim().parse().unwrap_or(0);
        let ppid: u32 = parts[1].trim().parse().unwrap_or(0);
        let comm = parts[2].trim();

        if is_main_process(ppid, comm) {
            return Some(pid);
        }
        // Collect parent PIDs that aren't in our list — for fallback scan
        if ppid != 1 && !pids.contains(&ppid) {
            parent_pids.push(ppid);
        }
    }

    // Fallback: main process might not appear in pgrep results (macOS args truncation)
    if parent_pids.is_empty() {
        return None;
    }

    let parent_arg: Vec<String> = parent_pids.iter().map(|p| p.to_string()).collect();
    let parent_ps = Command::new("ps")
        .args(["-o", "pid=,ppid=,comm=", "-p", &parent_arg.join(",")])
        .output()
        .ok()?;

    let parent_stdout = String::from_utf8_lossy(&parent_ps.stdout);
    for line in parent_stdout.trim().split('\n') {
        let parts: Vec<&str> = line.trim().splitn(3, char::is_whitespace).collect();
        if parts.len() < 3 {
            continue;
        }
        let pid: u32 = parts[0].trim().parse().unwrap_or(0);
        let ppid: u32 = parts[1].trim().parse().unwrap_or(0);
        let comm = parts[2].trim();

        if is_main_process(ppid, comm) {
            return Some(pid);
        }
    }

    None
}

/// Kill a single PID with SIGTERM (graceful), returns true if sent
fn kill_pid(pid: u32) -> bool {
    Command::new("kill")
        .arg(pid.to_string())
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

// ── Tauri Commands ───────────────────────────────────────────────────────────

/// Status: check if Antigravity.app is installed and/or running
#[tauri::command]
fn antigravity_status() -> serde_json::Value {
    let all_pids = find_all_pids();
    let running = !all_pids.is_empty();

    // Find the main process for the PID display
    let main_pid: Option<u32> = if running {
        find_main_pid(&all_pids).or_else(|| all_pids.first().copied())
    } else {
        None
    };

    let installed = std::path::Path::new(ANTIGRAVITY_APP_PATH).exists();

    serde_json::json!({
        "running": running,
        "pid": main_pid,
        "all_pids": all_pids,
        "installed": installed,
    })
}

/// Launch Antigravity.app: spawn detached, unref — mirrors _spawnProcess()
#[tauri::command]
fn antigravity_launch() -> Result<serde_json::Value, String> {
    use std::os::unix::process::CommandExt;

    let mut cmd = Command::new(ANTIGRAVITY_MACOS_BIN);
    // Detach: create new session so child outlives the tray process
    // Mirrors Node's { detached: true, stdio: 'ignore' } + child.unref()
    unsafe {
        cmd.pre_exec(|| {
            libc::setsid();
            Ok(())
        });
    }

    let child = cmd
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to launch Antigravity: {e}"))?;

    // Drop handle → equivalent to child.unref() in Node
    let pid = child.id();
    drop(child);

    Ok(serde_json::json!({ "ok": true, "pid": pid }))
}

/// Quit Antigravity: kill only the main process — children auto-terminate.
/// Mirrors killProcesses() in ide-launcher.ts.
#[tauri::command]
fn antigravity_quit() -> Result<serde_json::Value, String> {
    let all_pids = find_all_pids();
    if all_pids.is_empty() {
        return Ok(serde_json::json!({ "ok": true, "method": "not_running" }));
    }

    // Prefer to kill only the main process (mirrors _findMainProcessPid logic)
    let killed_pid = if let Some(main_pid) = find_main_pid(&all_pids) {
        log::info!("[n9-control] Killing main Antigravity process PID {main_pid}");
        kill_pid(main_pid);
        main_pid
    } else {
        // Fallback: kill all found pids
        log::warn!("[n9-control] Could not find main process, killing all {} PIDs", all_pids.len());
        for pid in &all_pids {
            kill_pid(*pid);
        }
        *all_pids.first().unwrap()
    };

    Ok(serde_json::json!({ "ok": true, "method": "kill_main", "pid": killed_pid }))
}

/// Restart: kill main process, wait for children to die, then relaunch
#[tauri::command]
fn antigravity_restart() -> Result<serde_json::Value, String> {
    // First quit
    let all_pids = find_all_pids();
    if !all_pids.is_empty() {
        if let Some(main_pid) = find_main_pid(&all_pids) {
            kill_pid(main_pid);
        } else {
            for pid in &all_pids {
                kill_pid(*pid);
            }
        }
        // Wait for clean shutdown (mirrors the 2000ms wait in killProcesses)
        std::thread::sleep(std::time::Duration::from_millis(2000));
    }

    // Relaunch
    antigravity_launch()
}

// ── App Entry ────────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            antigravity_status,
            antigravity_launch,
            antigravity_quit,
            antigravity_restart,
        ])
        .setup(|app| {
            // ── macOS: hide from Dock ──
            #[cfg(target_os = "macos")]
            {
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            }

            // ── Right-click context menu ──
            let quit_item = MenuItemBuilder::with_id("quit", "Quit n9 Control").build(app)?;
            let dashboard_item =
                MenuItemBuilder::with_id("dashboard", "Open Dashboard").build(app)?;
            let menu = MenuBuilder::new(app)
                .item(&dashboard_item)
                .separator()
                .item(&quit_item)
                .build()?;

            // ── Tray icon ──
            let tray_icon = TrayIconBuilder::new()
                .icon(Image::from_bytes(include_bytes!("../icons/tray-icon.png"))?)
                .icon_as_template(true)
                .tooltip("n9 Control — n9router")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "dashboard" => {
                        let _ = open::that("http://localhost:20128/dashboard");
                    }
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

            // ── Blur-hide ──
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
