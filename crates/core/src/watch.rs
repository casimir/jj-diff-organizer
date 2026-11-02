use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use notify::RecursiveMode;
use notify_debouncer_mini::{DebouncedEvent, Debouncer, new_debouncer};

use crate::repo::Repo;
use crate::review::change_id_of;

const OP_HEADS_DEBOUNCE: Duration = Duration::from_millis(50);
const SAFETY_NET_INTERVAL: Duration = Duration::from_secs(2);
const WORKSPACE_DEBOUNCE: Duration = Duration::from_millis(300);
const REVIEW_DEBOUNCE: Duration = Duration::from_millis(100);

type Callback = Arc<dyn Fn(Vec<String>) + Send + Sync>;

/// Reports every change of the operation heads, whatever wrote it.
pub struct OpWatch {
    repo: Repo,
    last: Arc<Mutex<Vec<String>>>,
    on_change: Callback,
    stop: Option<Sender<()>>,
    timer: Option<JoinHandle<()>>,
    _debouncer: Debouncer<notify::RecommendedWatcher>,
}

impl OpWatch {
    pub fn start(
        repo: Repo,
        on_change: impl Fn(Vec<String>) + Send + Sync + 'static,
    ) -> Result<Self, String> {
        let on_change: Callback = Arc::new(on_change);
        let last = Arc::new(Mutex::new(repo.op_heads()?));

        let check = {
            let (repo, last, on_change) = (repo.clone(), last.clone(), on_change.clone());
            move || check_heads(&repo, &last, &on_change)
        };

        let on_event = check.clone();
        let debouncer = watch(
            OP_HEADS_DEBOUNCE,
            &repo.op_heads_dir(),
            RecursiveMode::NonRecursive,
            move |_| on_event(),
        )?;

        let (stop, stopped) = mpsc::channel::<()>();
        let timer = thread::spawn(move || {
            loop {
                match stopped.recv_timeout(SAFETY_NET_INTERVAL) {
                    Err(RecvTimeoutError::Timeout) => check(),
                    _ => return,
                }
            }
        });

        Ok(Self {
            repo,
            last,
            on_change,
            stop: Some(stop),
            timer: Some(timer),
            _debouncer: debouncer,
        })
    }

    /// Re-lists the heads now; call when the window regains focus.
    pub fn check(&self) {
        check_heads(&self.repo, &self.last, &self.on_change);
    }
}

impl Drop for OpWatch {
    fn drop(&mut self) {
        drop(self.stop.take());
        if let Some(timer) = self.timer.take() {
            let _ = timer.join();
        }
    }
}

fn check_heads(repo: &Repo, last: &Mutex<Vec<String>>, on_change: &Callback) {
    let heads = match repo.op_heads() {
        Ok(heads) => heads,
        Err(e) => {
            eprintln!("op watch: {e}");
            return;
        }
    };
    let mut last = last.lock().unwrap();
    if *last != heads {
        *last = heads.clone();
        drop(last);
        on_change(heads);
    }
}

/// Reports edits to working copy files; the app only keeps one while its window is focused.
pub struct WorkspaceWatch {
    _debouncer: Debouncer<notify::RecommendedWatcher>,
}

impl WorkspaceWatch {
    pub fn start(root: PathBuf, on_change: impl Fn() + Send + 'static) -> Result<Self, String> {
        let watched = root.clone();
        let debouncer = watch(
            WORKSPACE_DEBOUNCE,
            move |res: Result<Vec<DebouncedEvent>, _>| {
                if let Ok(events) = res {
                    if events.iter().any(|e| !is_vcs_internal(&watched, &e.path)) {
                        on_change();
                    }
                }
            },
        )?;
        Ok(Self {
            _debouncer: debouncer,
        })
    }
}

/// Reports the change ids whose marks file was written or removed, by this app or by a sync tool.
pub struct ReviewWatch {
    _debouncer: Debouncer<notify::RecommendedWatcher>,
}

impl ReviewWatch {
    pub fn start(
        dir: &Path,
        on_change: impl Fn(Vec<String>) + Send + 'static,
    ) -> Result<Self, String> {
        let debouncer = watch(
            REVIEW_DEBOUNCE,
            dir,
            RecursiveMode::NonRecursive,
            move |events| {
                let ids: BTreeSet<String> = events
                    .iter()
                    .filter_map(|e| change_id_of(&e.path))
                    .collect();
                if !ids.is_empty() {
                    on_change(ids.into_iter().collect());
                }
            },
        )?;
        Ok(Self {
            _debouncer: debouncer,
        })
    }
}

fn is_vcs_internal(root: &Path, path: &Path) -> bool {
    path.strip_prefix(root)
        .ok()
        .and_then(|rel| rel.components().next())
        .is_some_and(|c| c.as_os_str() == ".jj" || c.as_os_str() == ".git")
}
