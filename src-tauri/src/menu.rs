use std::sync::{Arc, Mutex};

use serde::Deserialize;
use serde_json::{Map, Value};
use tauri::menu::{
    AboutMetadata, CheckMenuItem, HELP_SUBMENU_ID, IsMenuItem, Menu, MenuItem, PredefinedMenuItem,
    Submenu, WINDOW_SUBMENU_ID,
};
use tauri::{AppHandle, Listener, Manager, Wry};
use tauri_plugin_store::{Store, StoreExt};

use crate::updater::{self, CHECK_MENU_ID};
use crate::windows;

const NEW_WINDOW: &str = "new-window";
const OPEN: &str = "open";
const RELOAD: &str = "reload";
const QUIT: &str = "quit";
const RECENT_PREFIX: &str = "recent:";
const THEME_PREFIX: &str = "theme:";

const SETTINGS_FILE: &str = "settings.json";
const SETTINGS_KEY: &str = "settings";

const SYSTEM_THEME: &str = "system";
const THEMES: [(&str, &str); 3] = [
    (SYSTEM_THEME, "System Theme"),
    ("light", "Light Theme"),
    ("dark", "Dark Theme"),
];

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct Saved {
    theme: Option<String>,
    recent_repos: Vec<String>,
}

struct SavedMenus {
    recent: Submenu<Wry>,
    themes: Vec<(&'static str, CheckMenuItem<Wry>)>,
    rebuilding: Mutex<()>,
}

fn about_metadata(app: &AppHandle) -> AboutMetadata<'_> {
    let info = app.package_info();
    AboutMetadata {
        name: Some(info.name.clone()),
        version: Some(info.version.to_string()),
        ..Default::default()
    }
}

pub fn menu(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let mac = cfg!(target_os = "macos");
    let sep = || PredefinedMenuItem::separator(app);
    let item = |id: &str, text: &str, accelerator: Option<&str>| {
        MenuItem::with_id(app, id, text, true, accelerator)
    };
    // the terminal keeps the plain Ctrl keys
    let command_key = |key: &str| {
        if mac {
            format!("Cmd+{key}")
        } else {
            format!("Ctrl+Shift+{key}")
        }
    };

    let about = PredefinedMenuItem::about(app, None, Some(about_metadata(app)))?;
    let check = item(CHECK_MENU_ID, "Check for Updates…", None)?;
    let recent = Submenu::new(app, "Open Recent", false)?;
    let themes = THEMES
        .iter()
        .map(|(theme, label)| {
            CheckMenuItem::with_id(
                app,
                format!("{THEME_PREFIX}{theme}"),
                label,
                true,
                false,
                None::<&str>,
            )
            .map(|item| (*theme, item))
        })
        .collect::<tauri::Result<Vec<_>>>()?;
    let help = Submenu::with_id(app, HELP_SUBMENU_ID, "Help", true)?;

    let repository = Submenu::new(app, "Repository", true)?;
    repository.append_items(&[
        &item(NEW_WINDOW, "New Window", Some(&command_key("N")))?,
        &item(OPEN, "Open…", Some(&command_key("O")))?,
        &recent,
    ])?;
    if !mac {
        repository.append_items(&[&sep()?, &item(QUIT, "Quit", Some(&command_key("Q")))?])?;
    }

    let view = Submenu::new(app, "View", true)?;
    let theme_items: Vec<&dyn IsMenuItem<Wry>> = themes.iter().map(|(_, item)| item as _).collect();
    view.append_items(&theme_items)?;
    view.append_items(&[&sep()?, &item(RELOAD, "Reload", Some("CmdOrCtrl+Shift+R"))?])?;

    if !mac {
        help.append_items(&[&about, &check])?;
    }

    let menu = Menu::new(app)?;
    if mac {
        let app_menu = Submenu::new(app, &app.package_info().name, true)?;
        app_menu.append_items(&[
            &about,
            &check,
            &sep()?,
            &PredefinedMenuItem::services(app, None)?,
            &sep()?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &sep()?,
            &PredefinedMenuItem::quit(app, None)?,
        ])?;
        menu.append(&app_menu)?;
    }
    menu.append(&repository)?;
    if mac {
        menu.append(&Submenu::with_items(
            app,
            "Edit",
            true,
            &[
                &PredefinedMenuItem::undo(app, None)?,
                &PredefinedMenuItem::redo(app, None)?,
                &sep()?,
                &PredefinedMenuItem::cut(app, None)?,
                &PredefinedMenuItem::copy(app, None)?,
                &PredefinedMenuItem::paste(app, None)?,
                &PredefinedMenuItem::select_all(app, None)?,
            ],
        )?)?;
    }
    menu.append(&view)?;
    if mac {
        let windows = Submenu::with_id_and_items(
            app,
            WINDOW_SUBMENU_ID,
            "Window",
            true,
            &[
                &PredefinedMenuItem::minimize(app, None)?,
                &PredefinedMenuItem::maximize(app, Some("Zoom"))?,
                &sep()?,
                &PredefinedMenuItem::bring_all_to_front(app, None)?,
            ],
        )?;
        menu.append(&windows)?;
        #[cfg(target_os = "macos")]
        windows.set_as_windows_menu_for_nsapp()?;
    }
    menu.append(&help)?;
    #[cfg(target_os = "macos")]
    help.set_as_help_menu_for_nsapp()?;

    app.manage(SavedMenus {
        recent,
        themes,
        rebuilding: Mutex::default(),
    });
    Ok(menu)
}

pub fn on_event(app: &AppHandle, id: &str) {
    match id {
        CHECK_MENU_ID => updater::check(app, true),
        NEW_WINDOW => windows::new_window(app),
        OPEN => windows::pick_repo(app),
        QUIT => app.exit(0),
        RELOAD => {
            if let Some(window) = windows::active_window(app)
                && let Err(e) = window.reload()
            {
                eprintln!("cannot reload {}: {e}", window.label());
            }
        }
        _ => {
            if let Some(dir) = id.strip_prefix(RECENT_PREFIX) {
                windows::open_path(app, dir.into());
            } else if let Some(theme) = id.strip_prefix(THEME_PREFIX) {
                set_theme(app, theme);
            }
        }
    }
}

fn replace_items(menu: &Submenu<Wry>, items: &[&dyn IsMenuItem<Wry>]) -> tauri::Result<()> {
    for old in menu.items()? {
        menu.remove(&old)?;
    }
    menu.append_items(items)
}

fn settings_store(app: &AppHandle) -> Result<Arc<Store<Wry>>, String> {
    app.store(SETTINGS_FILE).map_err(|e| e.to_string())
}

fn saved(app: &AppHandle) -> Result<Saved, String> {
    let store = settings_store(app)?;
    match store.get(SETTINGS_KEY) {
        Some(saved) => serde_json::from_value(saved).map_err(|e| e.to_string()),
        None => Ok(Saved::default()),
    }
}

fn save_theme(app: &AppHandle, theme: &str) -> Result<(), String> {
    let store = settings_store(app)?;
    let mut saved = match store.get(SETTINGS_KEY) {
        Some(Value::Object(saved)) => saved,
        _ => Map::new(),
    };
    let theme = if theme == SYSTEM_THEME {
        Value::Null
    } else {
        Value::from(theme)
    };
    saved.insert(String::from("theme"), theme);
    store.set(SETTINGS_KEY, Value::Object(saved));
    Ok(())
}

fn set_theme(app: &AppHandle, theme: &str) {
    if let Err(e) = save_theme(app, theme) {
        eprintln!("cannot save the theme: {e}");
    }
}

fn rebuild(app: &AppHandle) -> Result<(), String> {
    let menus = app.state::<SavedMenus>();
    let _one_at_a_time = menus.rebuilding.lock().unwrap();
    let saved = saved(app)?;

    let current = saved.theme.as_deref().unwrap_or(SYSTEM_THEME);
    for (theme, item) in &menus.themes {
        item.set_checked(*theme == current)
            .map_err(|e| e.to_string())?;
    }

    let items = saved
        .recent_repos
        .iter()
        .map(|dir| {
            MenuItem::with_id(
                app,
                format!("{RECENT_PREFIX}{dir}"),
                dir,
                true,
                None::<&str>,
            )
        })
        .collect::<tauri::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    let items: Vec<&dyn IsMenuItem<Wry>> = items.iter().map(|i| i as _).collect();
    replace_items(&menus.recent, &items).map_err(|e| e.to_string())?;
    menus
        .recent
        .set_enabled(!saved.recent_repos.is_empty())
        .map_err(|e| e.to_string())
}

fn refresh(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        if let Err(e) = rebuild(&app) {
            eprintln!("cannot refresh the menus: {e}");
        }
    });
}

#[derive(Deserialize)]
struct StoreChange {
    key: String,
}

pub fn watch_settings(app: &AppHandle) {
    refresh(app);
    let handle = app.clone();
    app.listen("store://change", move |event| {
        match serde_json::from_str::<StoreChange>(event.payload()) {
            Ok(change) if change.key == SETTINGS_KEY => refresh(&handle),
            Ok(_) => {}
            Err(e) => eprintln!("unreadable store change: {e}"),
        }
    });
}
