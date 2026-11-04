use std::sync::atomic::{AtomicBool, Ordering};

use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_updater::UpdaterExt;

pub const CHECK_MENU_ID: &str = "check-for-updates";

static BUSY: AtomicBool = AtomicBool::new(false);

pub fn check(app: &AppHandle, manual: bool) {
    if BUSY.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let outcome = run(&app, manual).await;
        // stays busy once installed: no further check until restart
        if !matches!(outcome, Ok(true)) {
            BUSY.store(false, Ordering::SeqCst);
        }
        if let Err(e) = outcome {
            eprintln!("update check failed: {e}");
            if manual {
                info(&app, &format!("Update check failed: {e}"));
            }
        }
    });
}

async fn run(app: &AppHandle, manual: bool) -> tauri_plugin_updater::Result<bool> {
    let Some(update) = app.updater()?.check().await? else {
        if manual {
            info(app, "The application is up-to-date.");
        }
        return Ok(false);
    };
    update.download_and_install(|_, _| {}, || {}).await?;
    let restart = app.clone();
    app.dialog()
        .message(format!(
            "Version {} installed. Restart now?",
            update.version
        ))
        .title("Update ready")
        .buttons(MessageDialogButtons::OkCancelCustom(
            String::from("Restart"),
            String::from("Later"),
        ))
        .show(move |confirmed| {
            if confirmed {
                restart.restart();
            }
        });
    Ok(true)
}

fn info(app: &AppHandle, message: &str) {
    app.dialog().message(message).title("Updates").show(|_| {});
}
