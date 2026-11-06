use std::ffi::OsString;
use std::path::Path;
use std::sync::Arc;

use jjdo_core::diff::{FileView, file_view};
use jjdo_core::history::Entry;
use jjdo_core::hunk::HunkOp;
use jjdo_core::jj::{Change, Run, hunk_tool_config};
use jjdo_core::pty::Pty;
use jjdo_core::review::FileMarks;
use serde::Deserialize;
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::{AppHandle, State, WebviewWindow};

use crate::sessions::{RepoInfo, Session, Sessions, notify_changed, repo_info};
use crate::windows::{Attached, MAIN_WINDOW, attach};

const OP_LOG_LIMIT: usize = 200;

fn session_for(sessions: &Sessions, window: &WebviewWindow) -> Result<Arc<Session>, String> {
    sessions
        .get(window.label())
        .ok_or_else(|| String::from("no repository open"))
}

#[tauri::command]
pub fn start_dir(window: WebviewWindow) -> Option<String> {
    if window.label() != MAIN_WINDOW {
        return None;
    }
    let arg: Option<OsString> = std::env::args_os()
        .skip(1)
        .find(|a| !a.to_string_lossy().starts_with('-'));
    std::env::var_os("JJDO_REPO")
        .or(arg)
        .map(|dir| dir.to_string_lossy().into_owned())
}

#[tauri::command(async)]
pub fn current_repo(
    window: WebviewWindow,
    sessions: State<'_, Sessions>,
) -> Result<Option<RepoInfo>, String> {
    let Some(session) = sessions.get(window.label()) else {
        return Ok(None);
    };
    repo_info(&session.jj).map(Some)
}

#[tauri::command(async)]
pub fn open_repo(
    handle: AppHandle,
    window: WebviewWindow,
    sessions: State<'_, Sessions>,
    path: String,
) -> Result<RepoInfo, String> {
    if sessions.get(window.label()).is_some() {
        return Err("a repository is already open".into());
    }
    match attach(&handle, window.label(), Path::new(&path))? {
        Attached::Shown(info) => Ok(info),
        Attached::Elsewhere => Err(String::from("already open in another window")),
    }
}

#[tauri::command(async)]
pub fn graph(
    window: WebviewWindow,
    sessions: State<'_, Sessions>,
    revset: String,
) -> Result<Vec<Change>, String> {
    session_for(&sessions, &window)?.jj.graph(&revset)
}

#[tauri::command(async)]
pub fn successors(
    window: WebviewWindow,
    sessions: State<'_, Sessions>,
    revset: String,
    change_id: String,
) -> Result<Vec<String>, String> {
    session_for(&sessions, &window)?
        .jj
        .successors(&revset, &change_id)
}

#[tauri::command(async)]
pub fn show(
    window: WebviewWindow,
    sessions: State<'_, Sessions>,
    change_id: String,
) -> Result<Vec<FileView>, String> {
    session_for(&sessions, &window)?
        .jj
        .diff(&change_id)
        .map(|pairs| pairs.into_iter().map(file_view).collect())
}

#[tauri::command(async)]
pub fn history(window: WebviewWindow, sessions: State<'_, Sessions>) -> Result<Vec<Entry>, String> {
    let session = session_for(&sessions, &window)?;
    let ops = session.jj.op_log(OP_LOG_LIMIT)?;
    Ok(session.history.lock().unwrap().entries(&ops))
}

#[tauri::command]
pub fn marks(
    window: WebviewWindow,
    sessions: State<'_, Sessions>,
    change_id: String,
) -> Result<FileMarks, String> {
    session_for(&sessions, &window)?
        .review
        .lock()
        .unwrap()
        .marks(&change_id)
}

#[tauri::command]
pub fn review_set(
    window: WebviewWindow,
    sessions: State<'_, Sessions>,
    change_id: String,
    path: String,
    digests: Vec<String>,
    reviewed: bool,
    current: Vec<String>,
) -> Result<(), String> {
    session_for(&sessions, &window)?
        .review
        .lock()
        .unwrap()
        .set(&change_id, &path, &digests, reviewed, &current)
}

#[derive(Deserialize)]
pub struct HunkRef {
    op: HunkOp,
    path: String,
    digest: String,
}

#[tauri::command(async)]
pub fn run_jj(
    handle: AppHandle,
    window: WebviewWindow,
    sessions: State<'_, Sessions>,
    args: Vec<String>,
    hunk: Option<HunkRef>,
) -> Result<Run, String> {
    let config = match hunk {
        Some(h) => {
            let exe = std::env::current_exe().map_err(|e| e.to_string())?;
            hunk_tool_config(&exe, h.op, &h.path, &h.digest)
        }
        None => Vec::new(),
    };
    let session = session_for(&sessions, &window)?;
    let run = session.jj.run(sessions.next_run_id(), &args, &config);
    session.record_if_failed(&run);
    notify_changed(&handle, window.label(), run.op_after.clone());
    Ok(run)
}

#[tauri::command]
pub fn pty_start(
    window: WebviewWindow,
    sessions: State<'_, Sessions>,
    cols: u16,
    rows: u16,
    channel: Channel<InvokeResponseBody>,
) -> Result<(), String> {
    let exit_channel = channel.clone();
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".into());
    let session = session_for(&sessions, &window)?;
    let pty = Pty::spawn(
        &shell,
        &session.jj.repo().root,
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
    *session.pty.lock().unwrap() = Some(pty);
    Ok(())
}

#[tauri::command]
pub fn pty_write(
    window: WebviewWindow,
    sessions: State<'_, Sessions>,
    data: String,
) -> Result<(), String> {
    match session_for(&sessions, &window)?
        .pty
        .lock()
        .unwrap()
        .as_mut()
    {
        Some(pty) => pty.write(data.as_bytes()),
        None => Err("shell not started".into()),
    }
}

#[tauri::command]
pub fn pty_resize(
    window: WebviewWindow,
    sessions: State<'_, Sessions>,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    match session_for(&sessions, &window)?
        .pty
        .lock()
        .unwrap()
        .as_ref()
    {
        Some(pty) => pty.resize(cols, rows),
        None => Err("shell not started".into()),
    }
}
