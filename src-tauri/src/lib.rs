use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tauri_plugin_positioner::{Position, WindowExt};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .setup(|app| {
            // ── macOS: hide from Dock (menu bar only app) ──
            #[cfg(target_os = "macos")]
            {
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            }

            // ── Build right-click context menu ──
            let quit_item = MenuItemBuilder::with_id("quit", "Quit n9 Control").build(app)?;
            let dashboard_item =
                MenuItemBuilder::with_id("dashboard", "Open Dashboard").build(app)?;
            let menu = MenuBuilder::new(app)
                .item(&dashboard_item)
                .separator()
                .item(&quit_item)
                .build()?;

            // ── Create tray icon ──
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
                        // Open n9router dashboard in default browser
                        let _ = open::that("http://localhost:20128/dashboard");
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    // Use positioner plugin for tray-center positioning
                    tauri_plugin_positioner::on_tray_event(tray.app_handle(), &event);

                    // Left click toggles the popup window
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

            // Keep tray icon alive
            app.manage(tray_icon);

            // ── Get the main window and configure blur-hide ──
            if let Some(window) = app.get_webview_window("main") {
                let win = window.clone();
                window.on_window_event(move |event| {
                    // Hide popup when it loses focus
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
