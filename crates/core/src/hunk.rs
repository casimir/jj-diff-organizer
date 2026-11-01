use std::fs;
use std::io;
use std::path::Path;
use std::process::ExitCode;

use jj_diff::{DiffSpanStyle, canonical_review_snapshot, compute_file_diff_full_plain};

pub const EDITOR_COMMAND: &str = "keep-hunk";

pub fn hunk_digests(old: &str, new: &str) -> Vec<String> {
    canonical_review_snapshot(old, new)
        .fingerprints
        .into_iter()
        .map(|f| f.digest)
        .collect()
}

/// Hunk index of each line, `None` for unchanged lines. A hunk is a run of changed lines.
pub fn hunk_groups(changed: impl IntoIterator<Item = bool>) -> Vec<Option<usize>> {
    let mut count = 0;
    let mut prev = false;
    changed
        .into_iter()
        .map(|c| {
            if c && !prev {
                count += 1;
            }
            prev = c;
            c.then(|| count - 1)
        })
        .collect()
}

/// `old` with only the hunk identified by `digest` applied from `new`.
pub fn apply_only(old: &str, new: &str, digest: &str) -> io::Result<String> {
    let target = hunk_digests(old, new)
        .iter()
        .position(|d| d == digest)
        .ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::NotFound,
                "hunk not found: its content changed",
            )
        })?;
    let lines = compute_file_diff_full_plain("", old, new, false).lines;
    let groups = hunk_groups(lines.iter().map(|l| l.is_changed()));

    // jj-diff's line text drops `\r` and trailing blanks, so the output is cut from the sources.
    let old_lines: Vec<&str> = old.split_inclusive('\n').collect();
    let new_lines: Vec<&str> = new.split_inclusive('\n').collect();
    let mut out = String::new();
    for (line, group) in lines.iter().zip(groups) {
        let applies = group == Some(target);
        match line.style {
            DiffSpanStyle::Added if applies => out.push_str(raw(&new_lines, line.new_line_no)),
            DiffSpanStyle::Added => {}
            DiffSpanStyle::Removed if applies => {}
            _ => out.push_str(raw(&old_lines, line.old_line_no)),
        }
    }
    Ok(out)
}

fn raw<'a>(lines: &[&'a str], line_no: Option<u32>) -> &'a str {
    line_no
        .and_then(|n| lines.get(n.checked_sub(1)? as usize))
        .expect("diff line numbers index the sources it was computed from")
}

/// Runs the diff editor when `args` (the process arguments after the program name) are
/// `keep-hunk <left> <right> <path> <digest>`, as jj calls it through `merge-tools`.
pub fn try_editor(args: &[String]) -> Option<ExitCode> {
    let (command, rest) = args.split_first()?;
    if command != EDITOR_COMMAND {
        return None;
    }
    let [left, right, path, digest] = rest else {
        eprintln!("usage: {EDITOR_COMMAND} <left> <right> <path> <digest>");
        return Some(ExitCode::from(2));
    };
    Some(
        match keep_only_hunk(Path::new(left), Path::new(right), path, digest) {
            Ok(()) => ExitCode::SUCCESS,
            Err(e) => {
                eprintln!("{EDITOR_COMMAND}: {e}");
                ExitCode::FAILURE
            }
        },
    )
}

/// Diff editor body: leaves in `right` only the hunk `digest` of `rel_path`, everything
/// else reset to `left`.
pub fn keep_only_hunk(left: &Path, right: &Path, rel_path: &str, digest: &str) -> io::Result<()> {
    let mut paths = Vec::new();
    collect(left, left, &mut paths)?;
    collect(right, right, &mut paths)?;
    paths.sort();
    paths.dedup();

    for rel in paths.iter().filter(|p| p.as_str() != rel_path) {
        let (l, r) = (left.join(rel), right.join(rel));
        if l.exists() {
            if let Some(dir) = r.parent() {
                fs::create_dir_all(dir)?;
            }
            fs::copy(&l, &r)?;
        } else if r.exists() {
            fs::remove_file(&r)?;
        }
    }

    let old = fs::read_to_string(left.join(rel_path)).unwrap_or_default();
    let new = fs::read_to_string(right.join(rel_path))?;
    fs::write(right.join(rel_path), apply_only(&old, &new, digest)?)?;
    Ok(())
}

fn collect(base: &Path, dir: &Path, out: &mut Vec<String>) -> io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let path = entry?.path();
        if path.is_dir() {
            collect(base, &path, out)?;
        } else if let Ok(rel) = path.strip_prefix(base) {
            out.push(rel.to_string_lossy().into_owned());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn apply_only_changes_nothing_but_the_chosen_hunk() {
        let old = "keep  \r\nfirst\r\nmid \r\n\r\nsecond\r\ntail";
        let new = old.replace("first", "FIRST").replace("second", "SECOND");
        let digests = hunk_digests(old, &new);
        assert_eq!(digests.len(), 2);

        assert_eq!(
            apply_only(old, &new, &digests[0]).unwrap(),
            old.replace("first", "FIRST")
        );
        assert_eq!(
            apply_only(old, &new, &digests[1]).unwrap(),
            old.replace("second", "SECOND")
        );
    }
}
