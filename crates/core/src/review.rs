use std::collections::{BTreeMap, BTreeSet};
use std::fmt::Display;
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

pub type FileMarks = BTreeMap<String, BTreeSet<String>>;

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

    pub fn marks(&self, change_id: &str) -> Result<FileMarks, String> {
        let path = self.file(change_id)?;
        match fs::read_to_string(&path) {
            Ok(text) => serde_json::from_str(&text).map_err(at(&path)),
            Err(e) if e.kind() == ErrorKind::NotFound => Ok(FileMarks::new()),
            Err(e) => Err(at(&path)(e)),
        }
    }

    pub fn set_hunk(
        &self,
        change_id: &str,
        file: &str,
        key: &str,
        reviewed: bool,
        shown_keys: &[String],
    ) -> Result<(), String> {
        self.update(change_id, file, &[key.to_owned()], reviewed, shown_keys)
    }

    pub fn set_file(
        &self,
        change_id: &str,
        file: &str,
        reviewed: bool,
        shown_keys: &[String],
    ) -> Result<(), String> {
        self.update(change_id, file, shown_keys, reviewed, shown_keys)
    }

    fn update(
        &self,
        change_id: &str,
        file: &str,
        keys: &[String],
        reviewed: bool,
        shown_keys: &[String],
    ) -> Result<(), String> {
        let mut marks = self.marks(change_id)?;
        let entry = marks.entry(file.to_owned()).or_default();
        for key in keys {
            if reviewed {
                entry.insert(key.clone());
            } else {
                entry.remove(key);
            }
        }
        if !shown_keys.is_empty() && shown_keys.iter().all(|d| entry.contains(d)) {
            entry.retain(|d| shown_keys.contains(d));
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
        let text = serde_json::to_string(marks).map_err(at(&path))?;
        let tmp = self.dir.join(format!(".{change_id}.json.tmp"));
        fs::write(&tmp, text).map_err(at(&tmp))?;
        fs::rename(&tmp, &path).map_err(at(&path))
    }
}

fn at<E: Display>(path: &Path) -> impl Fn(E) -> String + '_ {
    move |e| format!("{}: {e}", path.display())
}

pub fn change_id_of(marks_file: &Path) -> Option<String> {
    if marks_file.extension()? != "json" {
        return None;
    }
    let stem = marks_file.file_stem()?.to_str()?;
    (!stem.starts_with('.')).then(|| stem.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn keys(ds: &[&str]) -> Vec<String> {
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
        let shown = keys(&["d1", "d2", "d3"]);
        store.set_hunk("c1", "a.txt", "d1", true, &shown).unwrap();
        store.set_hunk("c1", "a.txt", "d2", true, &shown).unwrap();
        store.set_hunk("c1", "a.txt", "d1", false, &shown).unwrap();

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
        let shown = keys(&["d1", "d2"]);
        store.set_hunk("c1", "a.txt", "d1", true, &shown).unwrap();
        assert!(store.dir().join("c1.json").exists());

        store.set_hunk("c1", "a.txt", "d1", false, &shown).unwrap();
        assert!(!store.dir().join("c1.json").exists());
    }

    #[test]
    fn a_file_is_marked_as_a_whole_and_unmarking_it_keeps_stale_marks() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path().join("reviews")).unwrap();
        let shown = keys(&["new1", "new2"]);

        store.set_file("c1", "b.txt", true, &shown).unwrap();
        assert_eq!(
            store.marks("c1").unwrap()["b.txt"],
            set_of(&["new1", "new2"])
        );

        store
            .set_hunk("c1", "a.txt", "old", true, &keys(&["old"]))
            .unwrap();
        store.set_hunk("c1", "a.txt", "new1", true, &shown).unwrap();
        store.set_file("c1", "a.txt", false, &shown).unwrap();
        assert_eq!(store.marks("c1").unwrap()["a.txt"], set_of(&["old"]));
    }

    #[test]
    fn stale_marks_go_once_every_shown_hunk_is_reviewed() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path().join("reviews")).unwrap();
        let shown = keys(&["new1", "new2"]);
        store
            .set_hunk("c1", "a.txt", "old", true, &keys(&["old"]))
            .unwrap();

        store.set_hunk("c1", "a.txt", "new1", true, &shown).unwrap();
        assert_eq!(
            store.marks("c1").unwrap()["a.txt"],
            set_of(&["old", "new1"])
        );

        store.set_hunk("c1", "a.txt", "new2", true, &shown).unwrap();
        assert_eq!(
            store.marks("c1").unwrap()["a.txt"],
            set_of(&["new1", "new2"])
        );
    }

    #[test]
    fn prune_keeps_only_live_changes() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path().join("reviews")).unwrap();
        store.set_hunk("live", "a.txt", "d1", true, &[]).unwrap();
        store.set_hunk("gone", "a.txt", "d1", true, &[]).unwrap();

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
