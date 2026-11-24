//! Detection of generated files, which the diff collapses by default.
//!
//! A file is generated when `linguist-generated` (GitHub) or `gitlab-generated` (GitLab) is set for it in its commit.

use std::collections::HashSet;
use std::io::Write;
use std::iter::once;
use std::path::Path;
use std::process::Stdio;
use std::thread;

use crate::repo::Repo;
use crate::shell_path::git_command;

const ATTRIBUTES: [&str; 2] = ["linguist-generated", "gitlab-generated"];

/// Returns the paths of `paths` marked generated in the commit `commit_id`.
///
/// Attributes come from the `.gitattributes` files of that commit's tree, nested ones included.
/// Without [`Repo::git_dir`], no path is generated.
///
/// # Errors
///
/// Returns git's message when `git check-attr` fails, or a description of its malformed output.
pub fn generated_paths(
    repo: &Repo,
    commit_id: &str,
    paths: &[&str],
) -> Result<HashSet<String>, String> {
    match &repo.git_dir {
        Some(git_dir) => check_attr(git_dir, commit_id, paths),
        None => Ok(HashSet::new()),
    }
}

fn check_attr(git_dir: &Path, commit_id: &str, paths: &[&str]) -> Result<HashSet<String>, String> {
    if paths.is_empty() {
        return Ok(HashSet::new());
    }

    let mut child = git_command()
        .arg("--git-dir")
        .arg(git_dir)
        .args(["check-attr", "-z", "--stdin"])
        .arg(format!("--source={commit_id}"))
        .args(ATTRIBUTES)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("cannot run git: {e}"))?;

    // git answers while it reads: feeding stdin from this thread would deadlock on a full stdout pipe.
    let mut stdin = child.stdin.take().expect("stdin is piped");
    let input: Vec<u8> = paths
        .iter()
        .flat_map(|path| path.bytes().chain(once(0)))
        .collect();
    let writer = thread::spawn(move || stdin.write_all(&input));

    let out = child
        .wait_with_output()
        .map_err(|e| format!("cannot run git: {e}"))?;
    let written = writer
        .join()
        .map_err(|_| String::from("the git input writer panicked"))?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_owned());
    }
    written.map_err(|e| format!("cannot write to git: {e}"))?;
    parse_check_attr(&out.stdout)
}

/// Returns the paths set to generated in the `path NUL attribute NUL value NUL` records of `git check-attr -z`.
fn parse_check_attr(out: &[u8]) -> Result<HashSet<String>, String> {
    let text = std::str::from_utf8(out).map_err(|e| format!("bad git check-attr output: {e}"))?;
    let mut fields = text.split_terminator('\0');
    let mut generated = HashSet::new();
    while let Some(path) = fields.next() {
        let (Some(_attribute), Some(value)) = (fields.next(), fields.next()) else {
            return Err(format!("truncated git check-attr output at {path}"));
        };
        if matches!(value, "set" | "true") {
            generated.insert(path.to_owned());
        }
    }
    Ok(generated)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn record(path: &str, attribute: &str, value: &str) -> String {
        format!("{path}\0{attribute}\0{value}\0")
    }

    #[test]
    fn only_a_set_or_true_attribute_makes_a_path_generated() {
        let out = [
            record("gen/out.rs", "linguist-generated", "set"),
            record("api.rs", "linguist-generated", "true"),
            record("keep.rs", "linguist-generated", "false"),
            record("Cargo.lock", "linguist-generated", "unset"),
            record("src/main.rs", "linguist-generated", "unspecified"),
            record("web.rs", "linguist-generated", "unspecified"),
            record("web.rs", "gitlab-generated", "set"),
        ]
        .concat();

        let generated = parse_check_attr(out.as_bytes()).unwrap();

        assert_eq!(
            generated,
            ["gen/out.rs", "api.rs", "web.rs"].map(String::from).into()
        );
    }

    #[test]
    fn truncated_output_is_an_error_not_a_missing_attribute() {
        let out = format!(
            "{}a.rs\0{}\0",
            record("b.rs", ATTRIBUTES[0], "set"),
            ATTRIBUTES[0]
        );

        let err = parse_check_attr(out.as_bytes()).unwrap_err();

        assert!(err.contains("a.rs"), "{err}");
    }
}
