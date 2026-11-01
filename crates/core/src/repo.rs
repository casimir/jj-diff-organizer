use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone)]
pub struct Repo {
    pub root: PathBuf,
    /// `.jj/repo` of the main workspace; differs from `root/.jj/repo` in secondary workspaces.
    pub repo_dir: PathBuf,
}

impl Repo {
    pub fn discover(start: &Path) -> Result<Self, String> {
        let out = Command::new("jj")
            .args(["--no-pager", "--ignore-working-copy", "root"])
            .current_dir(start)
            .output()
            .map_err(|e| format!("cannot run jj: {e}"))?;
        if !out.status.success() {
            return Err(String::from_utf8_lossy(&out.stderr).trim().to_owned());
        }
        let root = PathBuf::from(String::from_utf8_lossy(&out.stdout).trim());
        let repo_dir = resolve_repo_dir(&root)?;
        Ok(Self { root, repo_dir })
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
        };

        assert!(repo.op_heads().unwrap_err().contains("op_heads"));
    }
}
