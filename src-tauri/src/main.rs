mod menu;
mod updater;

use std::ffi::OsString;
use std::path::Path;
use std::process::ExitCode;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};

use jjdo_core::diff::{FileView, file_view};
use jjdo_core::history::{Entry, Failure, History};
use jjdo_core::hunk::try_editor;
use jjdo_core::jj::{Change, Jj, Run, hunk_tool_config, now_ms};
use jjdo_core::pty::Pty;
use jjdo_core::repo::Repo;
use jjdo_core::review::{FileMarks, Store};
use jjdo_core::watch::{OpWatch, ReviewWatch, WorkspaceWatch};
use serde::{Deserialize, Serialize};
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};

const OP_LOG_LIMIT: usize = 200;

struct Session {
    jj: Jj,
    review: Mutex<Store>,
    op_watch: OpWatch,
    _review_watch: ReviewWatch,
}

struct App {
    session: OnceLock<Session>,
    history: Mutex<History>,
    next_run: AtomicU64,
    pty: Mutex<Option<Pty>>,
    workspace_watch: Mutex<Option<WorkspaceWatch>>,
    snapshotting: Mutex<()>,
}

impl App {
    fn session(&self) -> Result<&Session, String> {
        self.session
            .get()
            .ok_or_else(|| "no repository open".into())
    }

    fn next_run_id(&self) -> u64 {
        self.next_run.fetch_add(1, Ordering::SeqCst)
    }

    fn record_if_failed(&self, run: &Run) -> bool {
        let failed = run.failed();
        if failed {
            self.history.lock().unwrap().push(Failure::from(run));
        }
        failed
    }
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

fn repo_info(jj: &Jj) -> Result<RepoInfo, String> {
    Ok(RepoInfo {
        root: jj.repo().root.display().to_string(),
        default_revset: jj.default_revset()?,
    })
}

fn open_session(handle: &AppHandle, dir: &Path) -> Result<(Session, RepoInfo), String> {
    let repo = Repo::discover(dir)?;
    let store = Store::open(repo.root.join(".jj").join("jjdo").join("reviews"))?;
    let jj = Jj::new(repo.clone());
    store.prune(&jj.mutable_change_ids()?)?;
    let info = repo_info(&jj)?;
    let on_review = handle.clone();
    let review_watch = ReviewWatch::start(store.dir(), move |ids| {
        emit(&on_review, "review-changed", ids);
    })?;
    let on_op = handle.clone();
    let op_watch = OpWatch::start(repo, move |heads| notify_changed(&on_op, heads))?;
    let session = Session {
        jj,
        review: Mutex::new(store),
        op_watch,
        _review_watch: review_watch,
    };
    Ok((session, info))
}

#[tauri::command]
async fn current_repo(app: State<'_, App>) -> Result<Option<RepoInfo>, String> {
    let Some(session) = app.session.get() else {
        return Ok(None);
    };
    let jj = session.jj.clone();
    blocking(move || repo_info(&jj)).await?.map(Some)
}

#[tauri::command]
fn start_dir() -> Option<String> {
    let arg: Option<OsString> = std::env::args_os()
        .skip(1)
        .find(|a| !a.to_string_lossy().starts_with('-'));
    std::env::var_os("JJDO_REPO")
        .or(arg)
        .map(|dir| dir.to_string_lossy().into_owned())
}

#[tauri::command]
async fn open_repo(
    handle: AppHandle,
    app: State<'_, App>,
    path: String,
) -> Result<RepoInfo, String> {
    if app.session.get().is_some() {
        return Err("a repository is already open".into());
    }
    let opener = handle.clone();
    let (session, info) = blocking(move || open_session(&opener, Path::new(&path))).await??;
    app.session
        .set(session)
        .map_err(|_| "a repository is already open".to_string())?;
    if let Some(window) = handle.get_webview_window("main")
        && window.is_focused().map_err(|e| e.to_string())?
    {
        on_focus_changed(&handle, true);
    }
    Ok(info)
}

#[tauri::command]
async fn graph(app: State<'_, App>, revset: String) -> Result<Vec<Change>, String> {
    let jj = app.session()?.jj.clone();
    blocking(move || jj.graph(&revset)).await?
}

#[tauri::command]
async fn show(app: State<'_, App>, change_id: String) -> Result<Vec<FileView>, String> {
    let jj = app.session()?.jj.clone();
    blocking(move || {
        jj.diff(&change_id)
            .map(|pairs| pairs.into_iter().map(file_view).collect())
    })
    .await?
}

#[tauri::command]
fn marks(app: State<'_, App>, change_id: String) -> Result<FileMarks, String> {
    app.session()?.review.lock().unwrap().marks(&change_id)
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
    app.session()?
        .review
        .lock()
        .unwrap()
        .set(&change_id, &path, &digests, reviewed, &current)
}

#[tauri::command]
async fn history(app: State<'_, App>) -> Result<Vec<Entry>, String> {
    let jj = app.session()?.jj.clone();
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
    let jj = app.session()?.jj.clone();
    let id = app.next_run_id();
    let run = blocking(move || jj.run(id, &args, &config)).await?;
    app.record_if_failed(&run);
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
        &app.session()?.jj.repo().root,
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

fn emit(handle: &AppHandle, event: &str, payload: Vec<String>) {
    if let Err(e) = handle.emit(event, payload) {
        eprintln!("cannot emit {event}: {e}");
    }
}

fn notify_changed(handle: &AppHandle, heads: Vec<String>) {
    emit(handle, "repo-changed", heads);
}

/// Failures of background work have no other place to show up than the history.
fn record_failure(handle: &AppHandle, command: &str, message: String) {
    let state = handle.state::<App>();
    state.history.lock().unwrap().push(Failure {
        id: state.next_run_id(),
        started: now_ms(),
        command: command.into(),
        output: message,
    });
    notify_changed(handle, Vec::new());
}

fn snapshot(handle: AppHandle) {
    std::thread::spawn(move || {
        let state = handle.state::<App>();
        let Ok(session) = state.session() else {
            return;
        };
        let _one_at_a_time = state.snapshotting.lock().unwrap();
        let run = session.jj.run(
            state.next_run_id(),
            &["util".into(), "snapshot".into()],
            &[],
        );
        if state.record_if_failed(&run) {
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
    let Ok(session) = state.session() else {
        return;
    };
    session.op_watch.check();
    snapshot(handle.clone());
    let on_edit = handle.clone();
    match WorkspaceWatch::start(session.jj.repo().root.clone(), move || {
        snapshot(on_edit.clone())
    }) {
        Ok(watch) => *state.workspace_watch.lock().unwrap() = Some(watch),
        Err(e) => record_failure(handle, "watch working copy", e),
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
        .menu(menu::menu)
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .on_menu_event(|app, event| match event.id().as_ref() {
            updater::CHECK_MENU_ID => updater::check(app, true),
            menu::RELOAD_MENU_ID => {
                if let Some(window) = app.get_webview_window("main")
                    && let Err(e) = window.reload()
                {
                    eprintln!("reload failed: {e}");
                }
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            start_dir,
            current_repo,
            open_repo,
            graph,
            show,
            marks,
            review_set,
            history,
            run_jj,
            pty_start,
            pty_write,
            pty_resize
        ])
        .setup(|app| {
            #[cfg(not(debug_assertions))]
            updater::check(app.handle(), false);

            app.manage(App {
                session: OnceLock::new(),
                history: Mutex::default(),
                next_run: AtomicU64::new(1),
                pty: Mutex::default(),
                workspace_watch: Mutex::default(),
                snapshotting: Mutex::default(),
            });

            if let Some(window) = app.get_webview_window("main") {
                let handle = app.handle().clone();
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
