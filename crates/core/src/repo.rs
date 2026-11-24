use std::fs;
use std::path::{Path, PathBuf};

use crate::shell_path::{git_command, jj_command};

#[derive(Debug, Clone)]
pub struct Repo {
    pub root: PathBuf,
    /// `.jj/repo` of the main workspace; differs from `root/.jj/repo` in secondary workspaces.
    pub repo_dir: PathBuf,
    /// Git directory of the backing store, set only when git can read attributes from a commit (see [`MIN_GIT_VERSION`]).
    pub git_dir: Option<PathBuf>,
}

/// `json()` map literals, used by the change template, arrived in this jj version.
const MIN_JJ_VERSION: (u32, u32) = (0, 46);

/// `git check-attr --source` arrived in this git version.
const MIN_GIT_VERSION: (u32, u32) = (2, 40);

impl Repo {
    pub fn discover(start: &Path) -> Result<Self, String> {
        check_jj_version()?;
        let out = jj_command()
            .args(["--no-pager", "--ignore-working-copy", "root"])
            .current_dir(start)
            .output()
            .map_err(|e| format!("cannot run jj: {e}"))?;
        if !out.status.success() {
            return Err(String::from_utf8_lossy(&out.stderr).trim().to_owned());
        }
        let root = PathBuf::from(String::from_utf8_lossy(&out.stdout).trim());
        let repo_dir = resolve_repo_dir(&root)?;
        let git_dir = git_dir(&repo_dir);
        Ok(Self {
            root,
            repo_dir,
            git_dir,
        })
    }

    pub fn op_heads_dir(&self) -> PathBuf {
        self.repo_dir.join("op_heads").join("heads")
    }

    pub fn op_heads(&self) -> Result<Vec<String>, String> {
        let dir = self.op_heads_dir();
        let mut heads = Vec::new();
        for entry in fs::read_dir(&dir).map_err(|e| format!("{}: {e}", dir.display()))? {
            let entry = entry.map_err(|e| format!("{}: {e}", dir.display()))?;
            if let Ok(name) = entry.file_name().into_string() {
                heads.push(name);
            }
        }
        heads.sort();
        Ok(heads)
    }
}

fn check_jj_version() -> Result<(), String> {
    let out = jj_command()
        .arg("--version")
        .output()
        .map_err(|e| format!("cannot run jj: {e}"))?;
    let text = String::from_utf8_lossy(&out.stdout);
    let version = text.trim();
    let found = version
        .strip_prefix("jj ")
        .and_then(major_minor)
        .ok_or_else(|| format!("unrecognized jj version: {version}"))?;
    if found < MIN_JJ_VERSION {
        return Err(format!(
            "jj {}.{} or newer is required, found {version}",
            MIN_JJ_VERSION.0, MIN_JJ_VERSION.1
        ));
    }
    Ok(())
}

/// `(major, minor)` of a dotted version, whatever follows them.
fn major_minor(version: &str) -> Option<(u32, u32)> {
    let mut parts = version.split('.');
    Some((parts.next()?.parse().ok()?, parts.next()?.parse().ok()?))
}

/// The store's git directory, when the backend is git and the installed git can read attributes from a commit.
fn git_dir(repo_dir: &Path) -> Option<PathBuf> {
    let store = repo_dir.join("store");
    let target = fs::read_to_string(store.join("git_target")).ok()?;
    let dir = store.join(target.trim()).canonicalize().ok()?;
    git_reads_attributes_from_commits().then_some(dir)
}

fn git_reads_attributes_from_commits() -> bool {
    let Ok(out) = git_command().arg("--version").output() else {
        return false;
    };
    let text = String::from_utf8_lossy(&out.stdout);
    out.status.success()
        && text
            .trim()
            .strip_prefix("git version ")
            .and_then(major_minor)
            .is_some_and(|v| v >= MIN_GIT_VERSION)
}

fn resolve_repo_dir(root: &Path) -> Result<PathBuf, String> {
    let link = root.join(".jj").join("repo");
    let dir = if link.is_file() {
        let target = fs::read_to_string(&link).map_err(|e| e.to_string())?;
        root.join(".jj").join(target.trim())
    } else {
        link
    };
    dir.canonicalize()
        .map_err(|e| format!("{}: {e}", dir.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_missing_op_heads_dir_is_an_error_naming_it() {
        let tmp = tempfile::tempdir().unwrap();
        let repo = Repo {
            root: tmp.path().to_owned(),
            repo_dir: tmp.path().join("missing"),
            git_dir: None,
        };

        assert!(repo.op_heads().unwrap_err().contains("op_heads"));
    }

    #[test]
    fn the_version_is_read_before_the_hash_or_vendor_suffix() {
        assert_eq!(major_minor("0.46.0-abc123"), Some((0, 46)));
        assert_eq!(major_minor("2.54.0 (Apple Git-157)"), Some((2, 54)));
    }
}
