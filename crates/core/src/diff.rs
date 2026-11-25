use jj_diff::{DiffLine, DiffSpanStyle, SyntaxToken, build_diff_display_lines, compute_file_diff};
use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::hunk::display_keys;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Added,
    Modified,
    Deleted,
    Renamed,
}

#[derive(Debug, PartialEq, Eq)]
pub struct FilePair {
    pub path: String,
    pub old_path: Option<String>,
    pub status: Status,
    pub content: String,
    pub old_content: String,
    pub binary: bool,
    pub blob: Option<String>,
    pub old_mode: Option<String>,
    pub mode: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct FileView {
    pub path: String,
    pub old_path: Option<String>,
    pub old_mode: Option<String>,
    pub mode: Option<String>,
    pub status: Status,
    pub binary: bool,
    pub generated: bool,
    pub blocks: Vec<Block>,
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Block {
    Hunk { key: String, lines: Vec<LineView> },
    Line { line: LineView },
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum LineKind {
    Context,
    Added,
    Removed,
    Separator,
}

#[derive(Debug, Serialize)]
pub struct LineView {
    pub old: Option<u32>,
    pub new: Option<u32>,
    pub kind: LineKind,
    pub spans: Vec<SpanView>,
}

#[derive(Debug, Serialize)]
pub struct SpanView {
    pub text: String,
    pub token: &'static str,
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
        old_mode: None,
        mode: None,
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
        } else if let Some(mode) = line.strip_prefix("old mode ") {
            pair.old_mode = Some(mode.to_owned());
        } else if let Some(mode) = line.strip_prefix("new mode ") {
            pair.mode = Some(mode.to_owned());
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

fn token_name(token: SyntaxToken) -> &'static str {
    match token {
        SyntaxToken::Plain => "plain",
        SyntaxToken::Keyword => "keyword",
        SyntaxToken::StringLit => "stringlit",
        SyntaxToken::Comment => "comment",
        SyntaxToken::Number => "number",
        SyntaxToken::Type => "type",
        SyntaxToken::Function => "function",
        SyntaxToken::Variable => "variable",
        SyntaxToken::Operator => "operator",
        SyntaxToken::Punctuation => "punctuation",
        SyntaxToken::Attribute => "attribute",
    }
}

/// Returns the key of the only hunk of a file whose change has no content lines: a digest of
/// what the change consists of, so any other metadata change of that file gets another key.
fn metadata_key(pair: &FilePair) -> String {
    let status = match pair.status {
        Status::Added => "added",
        Status::Modified => "modified",
        Status::Deleted => "deleted",
        Status::Renamed => "renamed",
    };
    let fields = [
        status,
        pair.old_path.as_deref().unwrap_or_default(),
        pair.old_mode.as_deref().unwrap_or_default(),
        pair.mode.as_deref().unwrap_or_default(),
    ];
    Sha256::digest(fields.join("\0"))
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

pub fn file_view(pair: FilePair, generated: bool) -> FileView {
    if pair.binary {
        return FileView {
            path: pair.path,
            old_path: pair.old_path,
            old_mode: pair.old_mode,
            mode: pair.mode,
            status: pair.status,
            binary: true,
            generated,
            blocks: pair
                .blob
                .into_iter()
                .map(|key| Block::Hunk {
                    key,
                    lines: Vec::new(),
                })
                .collect(),
        };
    }

    let diff = compute_file_diff(&pair.path, &pair.old_content, &pair.content, false);
    let display_lines = build_diff_display_lines(&diff.lines);
    let mut keys = display_keys(&pair.old_content, &pair.content).into_iter();
    let mut blocks: Vec<Block> = Vec::new();
    for display_line in &display_lines {
        let line = line_view(display_line);
        if !display_line.is_changed() {
            blocks.push(Block::Line { line });
        } else if let Some(Block::Hunk { lines, .. }) = blocks.last_mut() {
            lines.push(line);
        } else {
            let key = keys.next().expect("every displayed hunk has a key");
            blocks.push(Block::Hunk {
                key,
                lines: vec![line],
            });
        }
    }
    if !blocks.iter().any(|b| matches!(b, Block::Hunk { .. })) {
        blocks.push(Block::Hunk {
            key: metadata_key(&pair),
            lines: Vec::new(),
        });
    }

    FileView {
        path: pair.path,
        old_path: pair.old_path,
        old_mode: pair.old_mode,
        mode: pair.mode,
        status: pair.status,
        binary: false,
        generated,
        blocks,
    }
}

fn line_view(line: &DiffLine) -> LineView {
    LineView {
        old: line.old_line_no,
        new: line.new_line_no,
        kind: match line.style {
            DiffSpanStyle::Added => LineKind::Added,
            DiffSpanStyle::Removed => LineKind::Removed,
            DiffSpanStyle::Separator => LineKind::Separator,
            DiffSpanStyle::Context | DiffSpanStyle::Unchanged => LineKind::Context,
        },
        spans: line
            .spans
            .iter()
            .map(|s| SpanView {
                text: s.text.clone(),
                token: token_name(s.token),
            })
            .collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hunk::hunk_keys;

    fn numbered(edits: &[(usize, &str)]) -> String {
        (1..=30)
            .map(|n| match edits.iter().find(|(i, _)| *i == n) {
                Some((_, text)) => format!("{text}\n"),
                None => format!("line {n}\n"),
            })
            .collect()
    }

    #[test]
    fn displayed_hunks_carry_the_keys_that_marks_and_moves_use() {
        let old = numbered(&[]);
        let new = numbered(&[
            (2, "edited 2"),
            (3, "edited 3"),
            (15, "edited 15"),
            (29, "edited 29"),
        ]);
        let expected = hunk_keys(&old, &new);
        let pair = FilePair {
            path: "a.txt".into(),
            old_path: None,
            status: Status::Modified,
            content: new,
            old_content: old,
            binary: false,
            blob: None,
            old_mode: None,
            mode: None,
        };

        let view = file_view(pair, false);

        let keys: Vec<&str> = view
            .blocks
            .iter()
            .filter_map(|b| match b {
                Block::Hunk { key, .. } => Some(key.as_str()),
                Block::Line { .. } => None,
            })
            .collect();
        assert_eq!(keys, expected);
    }

    fn only_hunk_key(git: &[u8]) -> String {
        let pairs = parse_git_diff(git);
        assert_eq!(pairs.len(), 1);
        let view = file_view(pairs.into_iter().next().unwrap(), false);
        match &view.blocks[..] {
            [Block::Hunk { key, lines }] => {
                assert!(lines.is_empty());
                key.clone()
            }
            blocks => panic!("expected one hunk without lines, got {blocks:?}"),
        }
    }

    #[test]
    fn a_change_without_content_is_one_hunk_without_lines_keyed_by_the_change() {
        let rename = b"diff --git a/r.txt b/r2.txt\nrename from r.txt\nrename to r2.txt\n";
        let chmod = b"diff --git a/m.txt b/m.txt\nold mode 100644\nnew mode 100755\n";
        let unchmod = b"diff --git a/m.txt b/m.txt\nold mode 100755\nnew mode 100644\n";
        let empty =
            b"diff --git a/e.txt b/e.txt\nnew file mode 100644\nindex 0000000000..e69de29bb2\n";

        let keys = [&rename[..], &chmod[..], &unchmod[..], &empty[..]].map(only_hunk_key);

        for (i, key) in keys.iter().enumerate() {
            assert!(keys[i + 1..].iter().all(|other| other != key));
        }
    }

    #[test]
    fn a_mode_change_is_parsed() {
        let git = b"diff --git a/m.txt b/m.txt\nold mode 100644\nnew mode 100755\n";

        let pair = parse_git_diff(git).remove(0);

        assert_eq!(pair.old_mode.as_deref(), Some("100644"));
        assert_eq!(pair.mode.as_deref(), Some("100755"));
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
