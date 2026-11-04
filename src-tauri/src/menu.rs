use tauri::menu::{
    HELP_SUBMENU_ID, Menu, MenuItem, PredefinedMenuItem, Submenu, WINDOW_SUBMENU_ID,
};
use tauri::{AppHandle, Wry};

use crate::updater::CHECK_MENU_ID;

pub const RELOAD_MENU_ID: &str = "reload";

fn submenu(menu: &Menu<Wry>, id: &str) -> Submenu<Wry> {
    menu.get(id)
        .unwrap_or_else(|| panic!("the default menu has a {id} submenu"))
        .as_submenu_unchecked()
        .clone()
}

pub fn menu(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let menu = Menu::default(app)?;

    let reload = MenuItem::with_id(
        app,
        RELOAD_MENU_ID,
        "Reload",
        true,
        Some("CmdOrCtrl+Shift+R"),
    )?;
    submenu(&menu, WINDOW_SUBMENU_ID)
        .prepend_items(&[&reload, &PredefinedMenuItem::separator(app)?])?;

    let check = MenuItem::with_id(app, CHECK_MENU_ID, "Check for updates…", true, None::<&str>)?;
    if cfg!(target_os = "macos") {
        // the app submenu comes first and starts with About
        let app_menu = menu.items()?[0].as_submenu_unchecked().clone();
        app_menu.insert(&check, 1)?;
    } else {
        submenu(&menu, HELP_SUBMENU_ID).append(&check)?;
    }
    Ok(menu)
}
