use std::fs;
use std::io;
use std::path::Path;
use std::process::ExitCode;

use jj_diff::{
    DiffLine, DiffSpanStyle, canonical_review_snapshot, compute_file_diff_full_plain,
    display_group_canonical_indices,
};
use serde::Deserialize;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum HunkOp {
    Keep,
    Revert,
}

impl HunkOp {
    const ALL: [HunkOp; 2] = [HunkOp::Keep, HunkOp::Revert];

    pub const fn command(self) -> &'static str {
        match self {
            HunkOp::Keep => "keep-hunk",
            HunkOp::Revert => "revert-hunk",
        }
    }

    fn from_command(command: &str) -> Option<HunkOp> {
        Self::ALL.into_iter().find(|op| op.command() == command)
    }
}

struct Canonical {
    lines: Vec<DiffLine>,
    hunk_index_by_line: Vec<Option<usize>>,
    keys: Vec<String>,
}

fn canonical(old: &str, new: &str) -> Canonical {
    let lines = compute_file_diff_full_plain("", old, new, false).lines;
    let fingerprints = canonical_review_snapshot(old, new).fingerprints;

    let mut hunk_index_by_line = Vec::with_capacity(lines.len());
    let mut positions = Vec::new();
    let mut new_side_lines = 0;
    let mut in_hunk = false;
    for line in &lines {
        if line.is_changed() && !in_hunk {
            positions.push(new_side_lines + 1);
        }
        in_hunk = line.is_changed();
        hunk_index_by_line.push(in_hunk.then(|| positions.len() - 1));
        new_side_lines += usize::from(line.new_line_no.is_some());
    }
    assert_eq!(
        positions.len(),
        fingerprints.len(),
        "every run of changed lines has a fingerprint"
    );

    let keys = fingerprints
        .iter()
        .zip(positions)
        .map(|(fingerprint, position)| {
            if fingerprints.iter().filter(|f| *f == fingerprint).count() > 1 {
                format!("{}@{position}", fingerprint.digest)
            } else {
                fingerprint.digest.clone()
            }
        })
        .collect();
    Canonical {
        lines,
        hunk_index_by_line,
        keys,
    }
}

/// Returns the key of each hunk of `old` -> `new`, in order.
///
/// A hunk is a run of changed lines. Its key is jj-diff's digest of it, which names it across
/// recomputations. Twins, hunks of one file sharing a digest, get `@position` appended: the
/// number of new-side lines before the hunk, plus one.
pub fn hunk_keys(old: &str, new: &str) -> Vec<String> {
    canonical(old, new).keys
}

/// Returns the key of each hunk of the displayed diff of `old` -> `new`, in order.
pub fn display_keys(old: &str, new: &str) -> Vec<String> {
    let keys = hunk_keys(old, new);
    display_group_canonical_indices(old, new, false)
        .into_iter()
        .map(|indices| match indices[..] {
            [index] => keys[index as usize].clone(),
            _ => panic!("a displayed hunk is exactly one canonical hunk"),
        })
        .collect()
}

/// Returns `old` with only the hunk named `key` applied from `new`.
///
/// # Errors
///
/// Fails with `NotFound` when no hunk of `old` -> `new` has that key.
pub fn apply_only(old: &str, new: &str, key: &str) -> io::Result<String> {
    splice(old, new, key, |hunk, target| hunk == Some(target))
}

/// Returns `new` with only the hunk named `key` reverted to its `old` side.
///
/// # Errors
///
/// Fails with `NotFound` when no hunk of `old` -> `new` has that key.
pub fn revert_only(old: &str, new: &str, key: &str) -> io::Result<String> {
    splice(old, new, key, |hunk, target| {
        hunk.is_some_and(|h| h != target)
    })
}

// For each changed line, `takes_new(hunk, target)` picks `new`'s version or `old`'s, `hunk` being
// the index of the line's hunk and `target` the index of the one named `key`.
fn splice(
    old: &str,
    new: &str,
    key: &str,
    takes_new: impl Fn(Option<usize>, usize) -> bool,
) -> io::Result<String> {
    let Canonical {
        lines,
        hunk_index_by_line,
        keys,
    } = canonical(old, new);
    let target = keys.iter().position(|k| k == key).ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::NotFound,
            "hunk not found: its content changed",
        )
    })?;

    // jj-diff's line text drops `\r` and trailing blanks, so the output is cut from the sources.
    let old_lines: Vec<&str> = old.split_inclusive('\n').collect();
    let new_lines: Vec<&str> = new.split_inclusive('\n').collect();
    let mut out = String::new();
    for (line, hunk) in lines.iter().zip(hunk_index_by_line) {
        let applies = takes_new(hunk, target);
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

/// Runs the diff editor when `args` is a `HunkOp` command with its arguments, as jj calls it
/// through `merge-tools`.
pub fn try_editor(args: &[String]) -> Option<ExitCode> {
    let (command, rest) = args.split_first()?;
    let op = HunkOp::from_command(command)?;
    let [left, right, path, key] = rest else {
        eprintln!("usage: {} <left> <right> <path> <key>", op.command());
        return Some(ExitCode::from(2));
    };
    Some(
        match edit_hunk(op, Path::new(left), Path::new(right), path, key) {
            Ok(()) => ExitCode::SUCCESS,
            Err(e) => {
                eprintln!("{}: {e}", op.command());
                ExitCode::FAILURE
            }
        },
    )
}

/// Diff editor body. `Keep` leaves in `right` only the hunk `key` of `rel_path`, everything
/// else reset to `left`. `Revert` undoes that hunk in `right` and touches nothing else.
pub fn edit_hunk(
    op: HunkOp,
    left: &Path,
    right: &Path,
    rel_path: &str,
    key: &str,
) -> io::Result<()> {
    if op == HunkOp::Keep {
        reset_other_files(left, right, rel_path)?;
    }

    let old = fs::read_to_string(left.join(rel_path)).unwrap_or_default();
    let new = fs::read_to_string(right.join(rel_path))?;
    let edited = match op {
        HunkOp::Keep => apply_only(&old, &new, key)?,
        HunkOp::Revert => revert_only(&old, &new, key)?,
    };
    fs::write(right.join(rel_path), edited)
}

fn reset_other_files(left: &Path, right: &Path, rel_path: &str) -> io::Result<()> {
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
        let keys = hunk_keys(old, &new);
        assert_eq!(keys.len(), 2);

        assert_eq!(
            apply_only(old, &new, &keys[0]).unwrap(),
            old.replace("first", "FIRST")
        );
        assert_eq!(
            apply_only(old, &new, &keys[1]).unwrap(),
            old.replace("second", "SECOND")
        );
    }

    #[test]
    fn identical_hunks_get_distinct_keys_and_are_told_apart() {
        let old = "k\nk\nk\nx\nk\nk\nk\nx\nk\nk\nk\n";
        let new = old.replace('x', "X");
        let keys = hunk_keys(old, &new);
        assert_eq!(keys.len(), 2);
        assert_ne!(keys[0], keys[1]);

        assert_eq!(
            apply_only(old, &new, &keys[1]).unwrap(),
            "k\nk\nk\nx\nk\nk\nk\nX\nk\nk\nk\n"
        );
    }

    #[test]
    fn a_unique_hunk_is_keyed_by_the_digest_alone() {
        let old = "keep\nfirst\nmid\nsecond\ntail\n";
        let new = old.replace("first", "FIRST");
        let digests = canonical_review_snapshot(old, &new).fingerprints;
        assert_eq!(hunk_keys(old, &new), [digests[0].digest.clone()]);
    }

    #[test]
    fn a_twin_does_not_inherit_the_key_of_the_twin_that_went_away() {
        let old = "k\nk\nk\nx\nk\nk\nk\nx\nk\nk\nk\n";
        let both = old.replace('x', "X");
        let second_only = "k\nk\nk\nx\nk\nk\nk\nX\nk\nk\nk\n";
        let before = hunk_keys(old, &both);
        let after = hunk_keys(old, second_only);
        assert_eq!(after.len(), 1);
        assert!(!before.contains(&after[0]));
    }

    #[test]
    fn revert_only_undoes_nothing_but_the_chosen_hunk() {
        let old = "keep  \r\nfirst\r\nmid \r\n\r\nsecond\r\ntail";
        let new = old.replace("first", "FIRST").replace("second", "SECOND");
        let keys = hunk_keys(old, &new);

        assert_eq!(
            revert_only(old, &new, &keys[0]).unwrap(),
            old.replace("second", "SECOND")
        );
        assert_eq!(
            revert_only(old, &new, &keys[1]).unwrap(),
            old.replace("first", "FIRST")
        );
    }
}
