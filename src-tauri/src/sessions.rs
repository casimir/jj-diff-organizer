use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use jjdo_core::history::{Failure, History};
use jjdo_core::jj::{Jj, Run, now_ms};
use jjdo_core::pty::Pty;
use jjdo_core::repo::Repo;
use jjdo_core::review::Store;
use jjdo_core::watch::{OpWatch, ReviewWatch, WorkspaceWatch};
use serde::Serialize;
use tauri::{AppHandle, Emitter, EventTarget, Manager};

pub struct Session {
    pub(crate) history: Mutex<History>,
    pub(crate) jj: Jj,
    pub(crate) pty: Mutex<Option<Pty>>,
    pub(crate) review: Mutex<Store>,

    _review_watch: ReviewWatch,
    op_watch: OpWatch,
    snapshotting: Mutex<()>,
    workspace_watch: Mutex<Option<WorkspaceWatch>>,
}

impl Session {
    pub fn record_if_failed(&self, run: &Run) -> bool {
        let failed = run.failed();
        if failed {
            self.history.lock().unwrap().push(Failure::from(run));
        }
        failed
    }
}

pub enum Insert {
    Inserted,
    ShownElsewhere { by: String, source_was_empty: bool },
}

#[derive(Default)]
pub struct Sessions {
    by_label: Mutex<HashMap<String, Arc<Session>>>,
    next_run: AtomicU64,
}

impl Sessions {
    pub fn get(&self, label: &str) -> Option<Arc<Session>> {
        self.by_label.lock().unwrap().get(label).cloned()
    }

    pub fn next_run_id(&self) -> u64 {
        self.next_run.fetch_add(1, Ordering::SeqCst)
    }

    pub fn insert(&self, label: &str, session: Session) -> Insert {
        let mut by_label = self.by_label.lock().unwrap();
        let shown_by = by_label
            .iter()
            .find(|(other, shown)| {
                *other != label && shown.jj.repo().root == session.jj.repo().root
            })
            .map(|(other, _)| other.clone());
        if let Some(by) = shown_by {
            let source_was_empty = !by_label.contains_key(label);
            return Insert::ShownElsewhere {
                by,
                source_was_empty,
            };
        }
        by_label.insert(label.to_owned(), Arc::new(session));
        Insert::Inserted
    }

    pub fn remove(&self, label: &str) {
        self.by_label.lock().unwrap().remove(label);
    }
}

#[derive(Serialize)]
pub struct RepoInfo {
    root: String,
    default_revset: String,
}

pub fn repo_info(jj: &Jj) -> Result<RepoInfo, String> {
    Ok(RepoInfo {
        root: jj.repo().root.display().to_string(),
        default_revset: jj.default_revset()?,
    })
}

pub fn open(handle: &AppHandle, label: &str, repo: Repo) -> Result<(Session, RepoInfo), String> {
    let jj = Jj::new(repo.clone());

    let store = Store::open(repo.root.join(".jj").join("jjdo").join("reviews"))?;
    store.prune(&jj.mutable_change_ids()?)?;

    let info = repo_info(&jj)?;
    let on_review = handle.clone();
    let review_label = label.to_owned();
    let review_watch = ReviewWatch::start(store.dir(), move |ids| {
        emit(&on_review, &review_label, "review-changed", ids);
    })?;
    let (on_op, op_label) = (handle.clone(), label.to_owned());
    let op_watch = OpWatch::start(repo, move |heads| notify_changed(&on_op, &op_label, heads))?;
    let session = Session {
        history: Mutex::default(),
        jj,
        pty: Mutex::default(),
        review: Mutex::new(store),
        _review_watch: review_watch,
        op_watch,
        snapshotting: Mutex::default(),
        workspace_watch: Mutex::default(),
    };

    Ok((session, info))
}

fn emit(handle: &AppHandle, label: &str, event: &str, payload: Vec<String>) {
    if let Err(e) = handle.emit_to(EventTarget::webview_window(label), event, payload) {
        eprintln!("cannot emit {event}: {e}");
    }
}

pub fn notify_changed(handle: &AppHandle, label: &str, heads: Vec<String>) {
    emit(handle, label, "repo-changed", heads);
}

fn snapshot(handle: AppHandle, label: String) {
    tauri::async_runtime::spawn_blocking(move || {
        let sessions = handle.state::<Sessions>();
        let Some(session) = sessions.get(&label) else {
            return;
        };
        let _one_at_a_time = session.snapshotting.lock().unwrap();
        let run = session.jj.run(
            sessions.next_run_id(),
            &["util".into(), "snapshot".into()],
            &[],
        );
        if session.record_if_failed(&run) {
            notify_changed(&handle, &label, Vec::new());
        }
    });
}

fn record_failure(handle: &AppHandle, label: &str, command: &str, message: String) {
    let sessions = handle.state::<Sessions>();
    let Some(session) = sessions.get(label) else {
        return;
    };

    session.history.lock().unwrap().push(Failure {
        id: sessions.next_run_id(),
        started: now_ms(),
        command: command.into(),
        output: message,
    });
    notify_changed(handle, label, Vec::new());
}

pub fn on_focus_changed(handle: &AppHandle, label: &str, focused: bool) {
    let Some(session) = handle.state::<Sessions>().get(label) else {
        return;
    };

    if !focused {
        *session.workspace_watch.lock().unwrap() = None;
        return;
    }

    session.op_watch.check();
    snapshot(handle.clone(), label.to_owned());

    let (on_edit, edit_label) = (handle.clone(), label.to_owned());
    match WorkspaceWatch::start(session.jj.repo().root.clone(), move || {
        snapshot(on_edit.clone(), edit_label.clone())
    }) {
        Ok(watch) => *session.workspace_watch.lock().unwrap() = Some(watch),
        Err(e) => record_failure(handle, label, "watch working copy", e),
    }
}
