use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};

use jjdo_core::repo::Repo;
use tauri::{AppHandle, Manager, WebviewWindow, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

use crate::sessions::{self, Insert, RepoInfo, Sessions, on_focus_changed};

pub const MAIN_WINDOW: &str = "main";

#[derive(Default)]
pub struct Windows {
    next: AtomicU64,
    last_focused: Mutex<Option<String>>,
}

pub enum Attached {
    Shown(RepoInfo),
    Elsewhere,
}

pub fn attach(handle: &AppHandle, label: &str, dir: &Path) -> Result<Attached, String> {
    let repo = Repo::discover(dir)?;
    let (session, info) = sessions::open(handle, label, repo)?;
    match handle.state::<Sessions>().insert(label, session) {
        Insert::ShownElsewhere {
            by,
            source_was_empty,
        } => {
            raise(handle, &by);
            if source_was_empty {
                close(handle, label);
            }
            Ok(Attached::Elsewhere)
        }
        Insert::Inserted => {
            retitle(handle, label);
            if let Some(window) = handle.get_webview_window(label)
                && is_focused(&window)
            {
                on_focus_changed(handle, label, true);
            }
            Ok(Attached::Shown(info))
        }
    }
}

pub fn is_focused(window: &WebviewWindow) -> bool {
    window.is_focused().unwrap_or_else(|e| {
        eprintln!("cannot read the focus of {}: {e}", window.label());
        false
    })
}

pub fn active_window(handle: &AppHandle) -> Option<WebviewWindow> {
    // Check last focused instead of active because GTK menu can break the latter some times.
    let label = handle
        .state::<Windows>()
        .last_focused
        .lock()
        .unwrap()
        .clone()?;
    handle.get_webview_window(&label)
}

pub fn close(handle: &AppHandle, label: &str) {
    if let Some(window) = handle.get_webview_window(label)
        && let Err(e) = window.close()
    {
        eprintln!("cannot close {label}: {e}");
    }
}

pub fn raise(handle: &AppHandle, label: &str) {
    if let Some(window) = handle.get_webview_window(label)
        && let Err(e) = window.unminimize().and_then(|()| window.set_focus())
    {
        eprintln!("cannot raise {label}: {e}");
    }
}

pub fn retitle(handle: &AppHandle, label: &str) {
    let Some(session) = handle.state::<Sessions>().get(label) else {
        return;
    };

    let Some(name) = session.jj.repo().root.file_name() else {
        return;
    };

    if let Some(window) = handle.get_webview_window(label)
        && let Err(e) = window.set_title(&name.to_string_lossy())
    {
        eprintln!("cannot title {label}: {e}");
    }
}

pub fn watch(window: &WebviewWindow) {
    let handle = window.app_handle().clone();
    let label = window.label().to_owned();
    window.on_window_event(move |event| {
        if let WindowEvent::Focused(focused) = event {
            if *focused {
                *handle.state::<Windows>().last_focused.lock().unwrap() = Some(label.clone());
            }
            on_focus_changed(&handle, &label, *focused);
        }
    });
    if is_focused(window) {
        *window.state::<Windows>().last_focused.lock().unwrap() = Some(window.label().to_owned());
        on_focus_changed(window.app_handle(), window.label(), true);
    }
}

pub fn forget(handle: &AppHandle, label: &str) {
    let windows = handle.state::<Windows>();
    let mut last_focused = windows.last_focused.lock().unwrap();
    if last_focused.as_deref() == Some(label) {
        *last_focused = None;
    }
    drop(last_focused);
    handle.state::<Sessions>().remove(label);
}

fn next_label(handle: &AppHandle) -> String {
    let n = handle
        .state::<Windows>()
        .next
        .fetch_add(1, Ordering::SeqCst);
    format!("w{n}")
}

fn create_window(handle: &AppHandle, label: String) -> Result<(), String> {
    let mut config = handle
        .config()
        .app
        .windows
        .first()
        .cloned()
        .ok_or("no window configured")?;
    config.label = label;
    let window = WebviewWindowBuilder::from_config(handle, &config)
        .and_then(|builder| builder.build())
        .map_err(|e| e.to_string())?;
    watch(&window);
    retitle(handle, window.label());
    Ok(())
}

fn show_error(handle: &AppHandle, message: &str) {
    handle
        .dialog()
        .message(message)
        .title("Error")
        .kind(MessageDialogKind::Error)
        .show(|_| {});
}

pub fn new_window(handle: &AppHandle) {
    if let Err(e) = create_window(handle, next_label(handle)) {
        show_error(handle, &e);
    }
}

fn open_in_active_or_new(handle: &AppHandle, dir: &Path) -> Result<(), String> {
    if let Some(window) = active_window(handle) {
        return match attach(handle, window.label(), dir)? {
            Attached::Shown(_) => window.reload().map_err(|e| e.to_string()),
            Attached::Elsewhere => Ok(()),
        };
    }
    let label = next_label(handle);
    if let Attached::Elsewhere = attach(handle, &label, dir)? {
        return Ok(());
    }
    create_window(handle, label.clone()).inspect_err(|_| {
        handle.state::<Sessions>().remove(&label);
    })
}

pub fn open_path(handle: &AppHandle, dir: PathBuf) {
    let handle = handle.clone();
    tauri::async_runtime::spawn_blocking(move || {
        if let Err(e) = open_in_active_or_new(&handle, &dir) {
            show_error(&handle, &e);
        }
    });
}

pub fn pick_repo(handle: &AppHandle) {
    let picker = handle.clone();
    handle.dialog().file().pick_folder(move |dir| {
        let Some(dir) = dir else {
            return;
        };
        match dir.into_path() {
            Ok(dir) => open_path(&picker, dir),
            Err(e) => show_error(&picker, &e.to_string()),
        }
    });
}
