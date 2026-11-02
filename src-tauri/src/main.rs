use std::ffi::OsString;
use std::path::PathBuf;
use std::process::ExitCode;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};

use jjdo_core::diff::{FileView, file_view};
use jjdo_core::history::{Entry, History};
use jjdo_core::hunk::try_editor;
use jjdo_core::jj::{Change, Jj, Run, hunk_tool_config};
use jjdo_core::pty::Pty;
use jjdo_core::repo::Repo;
use jjdo_core::review::{FileMarks, Store};
use jjdo_core::watch::{OpWatch, ReviewWatch, WorkspaceWatch};
use serde::{Deserialize, Serialize};
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};

const OP_LOG_LIMIT: usize = 200;

struct App {
    jj: Jj,
    history: Mutex<History>,
    next_run: AtomicU64,
    pty: Mutex<Option<Pty>>,
    op_watch: Mutex<Option<OpWatch>>,
    workspace_watch: Mutex<Option<WorkspaceWatch>>,
    snapshotting: Mutex<()>,
    review: Mutex<Store>,
    _review_watch: ReviewWatch,
}

#[derive(Deserialize)]
struct HunkRef {
    path: String,
    digest: String,
}

#[derive(Serialize)]
struct RepoInfo {
    root: String,
    default_revset: String,
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn repo_info(app: State<'_, App>) -> Result<RepoInfo, String> {
    let jj = app.jj.clone();
    blocking(move || {
        jj.default_revset().map(|default_revset| RepoInfo {
            root: jj.repo().root.display().to_string(),
            default_revset,
        })
    })
    .await?
}

#[tauri::command]
async fn graph(app: State<'_, App>, revset: String) -> Result<Vec<Change>, String> {
    let jj = app.jj.clone();
    blocking(move || jj.graph(&revset)).await?
}

#[tauri::command]
async fn show(app: State<'_, App>, change_id: String) -> Result<Vec<FileView>, String> {
    let jj = app.jj.clone();
    blocking(move || {
        jj.diff(&change_id)
            .map(|pairs| pairs.into_iter().map(file_view).collect())
    })
    .await?
}

#[tauri::command]
fn marks(app: State<'_, App>, change_id: String) -> Result<FileMarks, String> {
    app.review.lock().unwrap().marks(&change_id)
}

#[tauri::command]
fn review_set(
    app: State<'_, App>,
    change_id: String,
    path: String,
    digests: Vec<String>,
    reviewed: bool,
    current: Vec<String>,
) -> Result<(), String> {
    app.review
        .lock()
        .unwrap()
        .set(&change_id, &path, &digests, reviewed, &current)
}

#[tauri::command]
async fn history(app: State<'_, App>) -> Result<Vec<Entry>, String> {
    let jj = app.jj.clone();
    let ops = blocking(move || jj.op_log(OP_LOG_LIMIT)).await??;
    Ok(app.history.lock().unwrap().entries(&ops))
}

#[tauri::command]
async fn run_jj(
    handle: AppHandle,
    app: State<'_, App>,
    args: Vec<String>,
    hunk: Option<HunkRef>,
) -> Result<Run, String> {
    let config = match hunk {
        Some(h) => {
            let exe = std::env::current_exe().map_err(|e| e.to_string())?;
            hunk_tool_config(&exe, &h.path, &h.digest)
        }
        None => Vec::new(),
    };
    let jj = app.jj.clone();
    let id = app.next_run.fetch_add(1, Ordering::SeqCst);
    let run = blocking(move || jj.run(id, &args, &config)).await?;
    app.history.lock().unwrap().push(run.clone());
    notify_changed(&handle, run.op_after.clone());
    Ok(run)
}

#[tauri::command]
fn pty_start(
    app: State<'_, App>,
    cols: u16,
    rows: u16,
    channel: Channel<InvokeResponseBody>,
) -> Result<(), String> {
    let exit_channel = channel.clone();
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".into());
    let pty = Pty::spawn(
        &shell,
        &app.jj.repo().root,
        cols,
        rows,
        move |bytes| {
            if let Err(e) = channel.send(InvokeResponseBody::Raw(bytes.to_vec())) {
                eprintln!("shell output not delivered: {e}");
            }
        },
        move || {
            if let Err(e) = exit_channel.send(InvokeResponseBody::Json("\"exit\"".into())) {
                eprintln!("shell exit not delivered: {e}");
            }
        },
    )?;
    *app.pty.lock().unwrap() = Some(pty);
    Ok(())
}

#[tauri::command]
fn pty_write(app: State<'_, App>, data: String) -> Result<(), String> {
    match app.pty.lock().unwrap().as_mut() {
        Some(pty) => pty.write(data.as_bytes()),
        None => Err("shell not started".into()),
    }
}

#[tauri::command]
fn pty_resize(app: State<'_, App>, cols: u16, rows: u16) -> Result<(), String> {
    match app.pty.lock().unwrap().as_ref() {
        Some(pty) => pty.resize(cols, rows),
        None => Err("shell not started".into()),
    }
}

fn notify_changed(handle: &AppHandle, heads: Vec<String>) {
    if let Err(e) = handle.emit("repo-changed", heads) {
        eprintln!("cannot emit repo-changed: {e}");
    }
}

/// Failures of background work have no other place to show up than the history.
fn record_failure(handle: &AppHandle, command: &str, message: String) {
    let state = handle.state::<App>();
    let id = state.next_run.fetch_add(1, Ordering::SeqCst);
    state.history.lock().unwrap().push(Run {
        id,
        command: command.into(),
        stdout: String::new(),
        stderr: message,
        exit_code: None,
        duration_ms: 0,
        op_before: Vec::new(),
        op_after: Vec::new(),
    });
    notify_changed(handle, Vec::new());
}

fn snapshot(handle: AppHandle) {
    std::thread::spawn(move || {
        let state = handle.state::<App>();
        let _one_at_a_time = state.snapshotting.lock().unwrap();
        let id = state.next_run.fetch_add(1, Ordering::SeqCst);
        let run = state.jj.run(id, &["util".into(), "snapshot".into()], &[]);
        if run.failed() {
            state.history.lock().unwrap().push(run);
            notify_changed(&handle, Vec::new());
        }
    });
}

fn on_focus_changed(handle: &AppHandle, focused: bool) {
    let state = handle.state::<App>();
    if !focused {
        *state.workspace_watch.lock().unwrap() = None;
        return;
    }
    if let Some(op_watch) = state.op_watch.lock().unwrap().as_ref() {
        op_watch.check();
    }
    snapshot(handle.clone());
    let on_edit = handle.clone();
    match WorkspaceWatch::start(state.jj.repo().root.clone(), move || {
        snapshot(on_edit.clone())
    }) {
        Ok(watch) => *state.workspace_watch.lock().unwrap() = Some(watch),
        Err(e) => record_failure(handle, "watch working copy", e),
    }
}

fn repo_start_dir() -> Result<PathBuf, String> {
    let arg: Option<OsString> = std::env::args_os()
        .skip(1)
        .find(|a| !a.to_string_lossy().starts_with('-'));
    match std::env::var_os("JJDO_REPO").or(arg) {
        Some(dir) => Ok(dir.into()),
        None => std::env::current_dir().map_err(|e| e.to_string()),
    }
}

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
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            repo_info, graph, show, marks, review_set, history, run_jj, pty_start, pty_write,
            pty_resize
        ])
        .setup(|app| {
            let repo = Repo::discover(&repo_start_dir()?)?;
            let store = Store::open(repo.root.join(".jj").join("jjdo").join("reviews"))?;
            let jj = Jj::new(repo.clone());
            store.prune(&jj.mutable_change_ids()?)?;
            let on_review = app.handle().clone();
            let review_watch = ReviewWatch::start(store.dir(), move |ids| {
                if let Err(e) = on_review.emit("review-changed", ids) {
                    eprintln!("cannot emit review-changed: {e}");
                }
            })?;
            app.manage(App {
                jj,
                history: Mutex::default(),
                next_run: AtomicU64::new(1),
                pty: Mutex::default(),
                op_watch: Mutex::default(),
                workspace_watch: Mutex::default(),
                snapshotting: Mutex::default(),
                review: Mutex::new(store),
                _review_watch: review_watch,
            });

            let handle = app.handle().clone();
            let op_watch = OpWatch::start(repo, move |heads| notify_changed(&handle, heads))?;
            *app.state::<App>().op_watch.lock().unwrap() = Some(op_watch);

            if let Some(window) = app.get_webview_window("main") {
                let handle = app.handle().clone();
                if window.is_focused()? {
                    on_focus_changed(&handle, true);
                }
                window.on_window_event(move |event| {
                    if let WindowEvent::Focused(focused) = event {
                        on_focus_changed(&handle, *focused);
                    }
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running the app");
}
