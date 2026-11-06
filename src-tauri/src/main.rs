mod handlers;
mod menu;
mod sessions;
mod updater;
mod windows;

use std::process::ExitCode;

use jjdo_core::hunk::try_editor;
use tauri::{AppHandle, Manager, RunEvent, WindowEvent};

use sessions::Sessions;
use windows::{MAIN_WINDOW, Windows};

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if let Some(code) = try_editor(&args) {
        return code;
    }
    run_app();
    ExitCode::SUCCESS
}

fn run_app() {
    tauri::Builder::default()
        .menu(menu::menu)
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .on_menu_event(|app, event| menu::on_event(app, event.id().as_ref()))
        .invoke_handler(tauri::generate_handler![
            handlers::start_dir,
            handlers::current_repo,
            handlers::open_repo,
            handlers::graph,
            handlers::successors,
            handlers::show,
            handlers::history,
            handlers::marks,
            handlers::review_set,
            handlers::run_jj,
            handlers::pty_start,
            handlers::pty_write,
            handlers::pty_resize,
        ])
        .setup(|app| {
            #[cfg(not(debug_assertions))]
            updater::check(app.handle(), false);

            app.manage(Sessions::default());
            app.manage(Windows::default());
            menu::watch_settings(app.handle());

            if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
                windows::watch(&window);
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building the app")
        .run(on_run_event);
}

fn on_run_event(handle: &AppHandle, event: RunEvent) {
    match event {
        RunEvent::WindowEvent {
            label,
            event: WindowEvent::Destroyed,
            ..
        } => windows::forget(handle, &label),
        #[cfg(target_os = "macos")]
        RunEvent::ExitRequested {
            code: None, api, ..
        } => api.prevent_exit(),
        #[cfg(target_os = "macos")]
        RunEvent::Reopen {
            has_visible_windows: false,
            ..
        } => windows::new_window(handle),
        _ => {}
    }
}
