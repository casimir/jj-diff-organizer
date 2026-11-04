use std::collections::{BTreeMap, BTreeSet};
use std::fmt::Display;
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

pub type FileMarks = BTreeMap<String, BTreeSet<String>>;

/// Reviewed hunk fingerprints per file, one JSON file per change id in a directory inside the repo.
/// Nothing is cached: files may be rewritten by a sync tool at any time.
#[derive(Debug)]
pub struct Store {
    dir: PathBuf,
}

impl Store {
    pub fn open(dir: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(&dir).map_err(at(&dir))?;
        Ok(Self { dir })
    }

    pub fn dir(&self) -> &Path {
        &self.dir
    }

    /// A missing file is no marks; an unreadable or corrupt one is an error naming the file.
    pub fn marks(&self, change_id: &str) -> Result<FileMarks, String> {
        let path = self.file(change_id)?;
        match fs::read_to_string(&path) {
            Ok(text) => serde_json::from_str(&text).map_err(at(&path)),
            Err(e) if e.kind() == ErrorKind::NotFound => Ok(FileMarks::new()),
            Err(e) => Err(at(&path)(e)),
        }
    }

    /// `current` holds every digest of the file's hunks now. Marks matching none of them are kept,
    /// to flag edited hunks, until all current hunks are reviewed: that state is the new baseline.
    pub fn set(
        &self,
        change_id: &str,
        file: &str,
        digests: &[String],
        reviewed: bool,
        current: &[String],
    ) -> Result<(), String> {
        let mut marks = self.marks(change_id)?;
        let entry = marks.entry(file.to_owned()).or_default();
        for digest in digests {
            if reviewed {
                entry.insert(digest.clone());
            } else {
                entry.remove(digest);
            }
        }
        if !current.is_empty() && current.iter().all(|d| entry.contains(d)) {
            entry.retain(|d| current.contains(d));
        }
        if entry.is_empty() {
            marks.remove(file);
        }
        self.save(change_id, &marks)
    }

    pub fn prune(&self, live: &BTreeSet<String>) -> Result<(), String> {
        for entry in fs::read_dir(&self.dir).map_err(at(&self.dir))? {
            let path = entry.map_err(at(&self.dir))?.path();
            if let Some(id) = change_id_of(&path)
                && !live.contains(&id)
            {
                fs::remove_file(&path).map_err(at(&path))?;
            }
        }
        Ok(())
    }

    fn file(&self, change_id: &str) -> Result<PathBuf, String> {
        if change_id.is_empty() || !change_id.chars().all(|c| c.is_ascii_alphanumeric()) {
            return Err(format!("invalid change id: {change_id:?}"));
        }
        Ok(self.dir.join(format!("{change_id}.json")))
    }

    fn save(&self, change_id: &str, marks: &FileMarks) -> Result<(), String> {
        let path = self.file(change_id)?;
        if marks.is_empty() {
            return match fs::remove_file(&path) {
                Err(e) if e.kind() != ErrorKind::NotFound => Err(at(&path)(e)),
                _ => Ok(()),
            };
        }
        let text = serde_json::to_string_pretty(marks).map_err(at(&path))?;
        let tmp = self.dir.join(format!(".{change_id}.json.tmp"));
        fs::write(&tmp, text).map_err(at(&tmp))?;
        fs::rename(&tmp, &path).map_err(at(&path))
    }
}

fn at<E: Display>(path: &Path) -> impl Fn(E) -> String + '_ {
    move |e| format!("{}: {e}", path.display())
}

/// The change id of a marks file; `None` for anything else, temp files included.
pub fn change_id_of(path: &Path) -> Option<String> {
    if path.extension()? != "json" {
        return None;
    }
    let stem = path.file_stem()?.to_str()?;
    (!stem.starts_with('.')).then(|| stem.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn digests(ds: &[&str]) -> Vec<String> {
        ds.iter().map(|d| (*d).to_owned()).collect()
    }

    fn set_of(ds: &[&str]) -> BTreeSet<String> {
        ds.iter().map(|d| (*d).to_owned()).collect()
    }

    #[test]
    fn marks_survive_a_reopen_and_a_corrupt_file_is_reported() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("reviews");

        let store = Store::open(path.clone()).unwrap();
        let current = digests(&["d1", "d2", "d3"]);
        store
            .set("c1", "a.txt", &digests(&["d1", "d2"]), true, &current)
            .unwrap();
        store
            .set("c1", "a.txt", &digests(&["d1"]), false, &current)
            .unwrap();

        let reopened = Store::open(path.clone()).unwrap();
        assert_eq!(reopened.marks("c1").unwrap()["a.txt"], set_of(&["d2"]));
        assert!(reopened.marks("other").unwrap().is_empty());

        fs::write(path.join("c1.json"), "{").unwrap();
        assert!(reopened.marks("c1").unwrap_err().contains("c1.json"));
    }

    #[test]
    fn unmarking_everything_removes_the_file() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path().join("reviews")).unwrap();
        let current = digests(&["d1", "d2"]);
        store
            .set("c1", "a.txt", &digests(&["d1"]), true, &current)
            .unwrap();
        assert!(store.dir().join("c1.json").exists());

        store
            .set("c1", "a.txt", &digests(&["d1"]), false, &current)
            .unwrap();
        assert!(!store.dir().join("c1.json").exists());
    }

    #[test]
    fn stale_marks_go_once_every_current_hunk_is_reviewed() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path().join("reviews")).unwrap();
        let current = digests(&["new1", "new2"]);
        store
            .set("c1", "a.txt", &digests(&["old"]), true, &digests(&["old"]))
            .unwrap();

        store
            .set("c1", "a.txt", &digests(&["new1"]), true, &current)
            .unwrap();
        assert_eq!(
            store.marks("c1").unwrap()["a.txt"],
            set_of(&["old", "new1"])
        );

        store
            .set("c1", "a.txt", &digests(&["new2"]), true, &current)
            .unwrap();
        assert_eq!(
            store.marks("c1").unwrap()["a.txt"],
            set_of(&["new1", "new2"])
        );
    }

    #[test]
    fn prune_keeps_only_live_changes() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path().join("reviews")).unwrap();
        let current = digests(&["d1"]);
        store.set("live", "a.txt", &current, true, &[]).unwrap();
        store.set("gone", "a.txt", &current, true, &[]).unwrap();

        store.prune(&set_of(&["live"])).unwrap();

        assert!(!store.marks("live").unwrap().is_empty());
        assert!(store.marks("gone").unwrap().is_empty());
    }

    #[test]
    fn change_ids_cannot_escape_the_directory() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path().join("reviews")).unwrap();
        assert!(store.marks("../x").is_err());
    }
}
