use jj_diff::{DiffSpanStyle, compute_file_diff};
use serde::Serialize;

use crate::hunk::hunk_digests;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Added,
    Modified,
    Deleted,
    Renamed,
}

/// Both sides of one file, rebuilt from a full-context git diff.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FilePair {
    pub path: String,
    pub old_path: Option<String>,
    pub status: Status,
    pub content: String,
    pub old_content: String,
    pub binary: bool,
    /// Blob id of the new side, the identity of a binary file's only "hunk".
    pub blob: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct FileView {
    pub path: String,
    pub old_path: Option<String>,
    pub status: Status,
    pub binary: bool,
    pub digests: Vec<String>,
    pub lines: Vec<LineView>,
}

#[derive(Debug, Serialize)]
pub struct LineView {
    pub old: Option<u32>,
    pub new: Option<u32>,
    pub kind: &'static str,
    /// Index into `FileView::digests`, for the lines of a hunk.
    pub group: Option<u32>,
    pub spans: Vec<SpanView>,
}

#[derive(Debug, Serialize)]
pub struct SpanView {
    pub text: String,
    pub token: String,
}

/// Parses `jj diff --git --context <huge>` output: one hunk per file holding both sides.
pub fn parse_git_diff(out: &[u8]) -> Vec<FilePair> {
    let mut starts = Vec::new();
    let mut pos = 0;
    for line in out.split_inclusive(|&b| b == b'\n') {
        if line.starts_with(b"diff --git ") {
            starts.push(pos);
        }
        pos += line.len();
    }
    starts.push(out.len());
    starts
        .windows(2)
        .map(|w| parse_section(&out[w[0]..w[1]]))
        .collect()
}

fn parse_section(section: &[u8]) -> FilePair {
    let text = String::from_utf8_lossy(section);
    let mut lines = text.split('\n');
    let header = lines.next().unwrap_or_default();
    let path = header
        .strip_prefix("diff --git a/")
        .and_then(|rest| rest.rsplit_once(" b/"))
        .map_or_else(|| header.to_owned(), |(_, new)| new.to_owned());

    let mut pair = FilePair {
        path,
        old_path: None,
        status: Status::Modified,
        content: String::new(),
        old_content: String::new(),
        binary: std::str::from_utf8(section).is_err(),
        blob: None,
    };
    let mut in_hunk = false;
    let mut last = ' ';
    for line in lines {
        if in_hunk {
            let body = line.get(1..).unwrap_or_default();
            match line.chars().next() {
                Some(c @ (' ' | '-' | '+')) => {
                    last = c;
                    if c != '+' {
                        pair.old_content.push_str(body);
                        pair.old_content.push('\n');
                    }
                    if c != '-' {
                        pair.content.push_str(body);
                        pair.content.push('\n');
                    }
                }
                Some('\\') => {
                    if last != '+' {
                        pair.old_content.pop();
                    }
                    if last != '-' {
                        pair.content.pop();
                    }
                }
                _ => {}
            }
        } else if line.starts_with("@@") {
            in_hunk = true;
        } else if line.starts_with("new file mode") {
            pair.status = Status::Added;
        } else if line.starts_with("deleted file mode") {
            pair.status = Status::Deleted;
        } else if let Some(from) = line.strip_prefix("rename from ") {
            pair.old_path = Some(from.to_owned());
        } else if let Some(to) = line.strip_prefix("rename to ") {
            pair.status = Status::Renamed;
            pair.path = to.to_owned();
        } else if let Some(from) = line.strip_prefix("copy from ") {
            pair.old_path = Some(from.to_owned());
        } else if let Some(to) = line.strip_prefix("copy to ") {
            pair.status = Status::Added;
            pair.path = to.to_owned();
        } else if let Some(ids) = line.strip_prefix("index ") {
            pair.blob = ids
                .split_whitespace()
                .next()
                .and_then(|range| range.split_once(".."))
                .map(|(_, new)| new.to_owned());
        } else if line.starts_with("Binary files ") {
            pair.binary = true;
        }
    }
    if pair.binary {
        pair.old_content.clear();
        pair.content.clear();
    }
    if pair.status == Status::Added {
        pair.old_content.clear();
    }
    pair
}

pub fn file_view(pair: FilePair) -> FileView {
    if pair.binary {
        return FileView {
            path: pair.path,
            old_path: pair.old_path,
            status: pair.status,
            binary: true,
            digests: pair.blob.into_iter().collect(),
            lines: Vec::new(),
        };
    }

    let diff = compute_file_diff(&pair.path, &pair.old_content, &pair.content, false);
    let mut next_group = 0;
    let mut group = None;
    let lines = diff
        .lines
        .iter()
        .map(|line| {
            if !line.is_changed() {
                group = None;
            } else if group.is_none() {
                group = Some(next_group);
                next_group += 1;
            }
            LineView {
                old: line.old_line_no,
                new: line.new_line_no,
                kind: match line.style {
                    DiffSpanStyle::Added => "added",
                    DiffSpanStyle::Removed => "removed",
                    DiffSpanStyle::Separator => "separator",
                    DiffSpanStyle::Context | DiffSpanStyle::Unchanged => "context",
                },
                group: if line.is_changed() { group } else { None },
                spans: line
                    .spans
                    .iter()
                    .map(|s| SpanView {
                        text: s.text.clone(),
                        token: format!("{:?}", s.token).to_lowercase(),
                    })
                    .collect(),
            }
        })
        .collect();

    FileView {
        digests: hunk_digests(&pair.old_content, &pair.content),
        path: pair.path,
        old_path: pair.old_path,
        status: pair.status,
        binary: false,
        lines,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn numbered(edits: &[(usize, &str)]) -> String {
        (1..=30)
            .map(|n| match edits.iter().find(|(i, _)| *i == n) {
                Some((_, text)) => format!("{text}\n"),
                None => format!("line {n}\n"),
            })
            .collect()
    }

    #[test]
    fn displayed_groups_match_the_fingerprints_that_marks_and_moves_use() {
        let old = numbered(&[]);
        let new = numbered(&[
            (2, "edited 2"),
            (3, "edited 3"),
            (15, "edited 15"),
            (29, "edited 29"),
        ]);
        let pair = FilePair {
            path: "a.txt".into(),
            old_path: None,
            status: Status::Modified,
            content: new,
            old_content: old,
            binary: false,
            blob: None,
        };

        let view = file_view(pair);

        let mut groups: Vec<u32> = view.lines.iter().filter_map(|l| l.group).collect();
        groups.dedup();
        assert_eq!(groups, [0, 1, 2]);
        assert_eq!(view.digests.len(), 3);
    }

    #[test]
    fn a_copy_is_an_addition_that_remembers_its_source() {
        let git = b"diff --git a/src.txt b/copy.txt\ncopy from src.txt\ncopy to copy.txt\nindex 1..2 100644\n--- a/src.txt\n+++ b/copy.txt\n@@ -1,2 +1,3 @@\n a\n+b\n c\n";

        let pairs = parse_git_diff(git);

        assert_eq!(pairs.len(), 1);
        let pair = &pairs[0];
        assert_eq!(pair.path, "copy.txt");
        assert_eq!(pair.old_path.as_deref(), Some("src.txt"));
        assert_eq!(pair.status, Status::Added);
        assert_eq!(pair.old_content, "");
        assert_eq!(pair.content, "a\nb\nc\n");
    }
}
