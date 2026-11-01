use std::collections::{BTreeMap, BTreeSet};
use std::fmt::Display;
use std::fs;
use std::path::PathBuf;

pub type FileMarks = BTreeMap<String, BTreeSet<String>>;

/// Reviewed hunk fingerprints per change id and file, kept in one JSON file outside the repo.
#[derive(Debug)]
pub struct Store {
    path: PathBuf,
    marks: BTreeMap<String, FileMarks>,
}

impl Store {
    /// A missing file is an empty store; an unreadable or corrupt one is an error naming the file.
    pub fn open(path: PathBuf) -> Result<Self, String> {
        let marks = match fs::read_to_string(&path) {
            Ok(text) => {
                serde_json::from_str(&text).map_err(|e| format!("{}: {e}", path.display()))?
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => BTreeMap::new(),
            Err(e) => return Err(format!("{}: {e}", path.display())),
        };
        Ok(Self { path, marks })
    }

    pub fn marks(&self, change_id: &str) -> FileMarks {
        self.marks.get(change_id).cloned().unwrap_or_default()
    }

    // ponytail: stale digests are never pruned, so `jj undo` brings marks back; prune by age if the file ever grows.
    pub fn set(
        &mut self,
        change_id: &str,
        file: &str,
        digests: &[String],
        reviewed: bool,
    ) -> Result<(), String> {
        let entry = self
            .marks
            .entry(change_id.to_owned())
            .or_default()
            .entry(file.to_owned())
            .or_default();
        for digest in digests {
            if reviewed {
                entry.insert(digest.clone());
            } else {
                entry.remove(digest);
            }
        }
        self.save()
    }

    fn save(&self) -> Result<(), String> {
        let fail = |e: std::io::Error| format!("{}: {e}", self.path.display());
        if let Some(dir) = self.path.parent() {
            fs::create_dir_all(dir).map_err(fail)?;
        }
        let text = serde_json::to_string_pretty(&self.marks).map_err(|e| e.to_string())?;
        let tmp = self.path.with_extension("json.tmp");
        fs::write(&tmp, text).map_err(fail)?;
        fs::rename(&tmp, &self.path).map_err(fail)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn marks_survive_a_reopen_and_a_corrupt_file_is_reported() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("reviews").join("repo.json");

        let mut store = Store::open(path.clone()).unwrap();
        store
            .set("c1", "a.txt", &["d1".into(), "d2".into()], true)
            .unwrap();
        store.set("c1", "a.txt", &["d1".into()], false).unwrap();

        let reopened = Store::open(path.clone()).unwrap();
        assert_eq!(
            reopened.marks("c1")["a.txt"],
            BTreeSet::from(["d2".to_owned()])
        );
        assert!(reopened.marks("other").is_empty());

        fs::write(&path, "{").unwrap();
        assert!(Store::open(path).unwrap_err().contains("repo.json"));
    }
}
