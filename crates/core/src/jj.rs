use std::collections::BTreeSet;
use std::path::Path;
use std::process::Command;
use std::time::Instant;

use serde::{Deserialize, Serialize};

use crate::diff::{FilePair, parse_git_diff};
use crate::hunk::EDITOR_COMMAND;
use crate::repo::Repo;

/// Name of the diff editor that `hunk_tool_config` defines for a single run.
pub const HUNK_TOOL: &str = "jjdo-hunk";

/// More context than any file has lines, so each file's hunk holds both of its sides.
const FULL_CONTEXT: &str = "1000000000";

/// A jj invocation made by the app itself, as opposed to one typed in the shell.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Run {
    pub id: u64,
    pub command: String,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub duration_ms: u64,
    pub op_before: Vec<String>,
    pub op_after: Vec<String>,
}

impl Run {
    pub fn failed(&self) -> bool {
        self.exit_code != Some(0)
    }

    pub fn created_op(&self) -> bool {
        self.op_before != self.op_after
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Change {
    pub change_id: String,
    pub short: String,
    pub commit_id: String,
    pub parents: Vec<String>,
    pub desc: String,
    pub bookmarks: Vec<String>,
    pub wc: bool,
    pub immutable: bool,
    pub empty: bool,
    pub conflict: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Op {
    pub id: String,
    pub description: String,
    pub is_snapshot: bool,
    pub time: OpTime,
    pub attributes: OpAttributes,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpTime {
    pub start: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct OpAttributes {
    #[serde(default)]
    pub args: String,
}

impl Op {
    pub fn from_gui(&self) -> bool {
        self.attributes.args.contains(GUI_MARKER)
    }

    /// The op with the marker removed from its recorded command, as jj quotes it.
    pub fn without_marker(mut self) -> Self {
        self.attributes.args = self
            .attributes
            .args
            .replace(&format!(" --config '{GUI_MARKER}'"), "");
        self
    }
}

const CHANGE_TEMPLATE: &str = r#"json({
  "change_id" => change_id,
  "short" => change_id.short(8),
  "commit_id" => commit_id,
  "parents" => parents.map(|p| p.commit_id()),
  "desc" => description.first_line(),
  "bookmarks" => bookmarks.map(|b| b.name()),
  "wc" => current_working_copy,
  "immutable" => immutable,
  "empty" => empty,
  "conflict" => conflict,
}) ++ "\n""#;

/// Unused config that `Jj::run` passes so jj records it in the operation's `args`.
pub const GUI_MARKER: &str = "jjdo.gui=true";

const READ_FLAGS: [&str; 4] = [
    "--color=never",
    "--no-pager",
    "--at-op=@",
    "--ignore-working-copy",
];

#[derive(Debug, Clone)]
pub struct Jj {
    repo: Repo,
}

impl Jj {
    pub fn new(repo: Repo) -> Self {
        Self { repo }
    }

    pub fn repo(&self) -> &Repo {
        &self.repo
    }

    /// Runs a mutating (or any) command and records everything about it. `config` holds
    /// `--config` arguments that jj gets but the recorded command leaves out.
    pub fn run(&self, id: u64, args: &[String], config: &[String]) -> Run {
        let op_before = self.repo.op_heads();
        let started = Instant::now();
        let out = self
            .command(&["--color=never", "--no-pager"])
            .args(["--config", GUI_MARKER])
            .args(config)
            .args(args)
            .output();
        let duration_ms = started.elapsed().as_millis() as u64;
        let (stdout, stderr, exit_code) = match out {
            Ok(o) => (
                String::from_utf8_lossy(&o.stdout).into_owned(),
                String::from_utf8_lossy(&o.stderr).into_owned(),
                o.status.code(),
            ),
            Err(e) => (String::new(), format!("cannot run jj: {e}"), None),
        };
        Run {
            id,
            command: display_command(args),
            stdout,
            stderr,
            exit_code,
            duration_ms,
            op_before,
            op_after: self.repo.op_heads(),
        }
    }

    pub fn default_revset(&self) -> Result<String, String> {
        self.read(
            &["--ignore-working-copy"],
            &["config", "get", "revsets.log"],
        )
        .map(|s| s.trim().to_owned())
    }

    pub fn graph(&self, revset: &str) -> Result<Vec<Change>, String> {
        let out = self.read(
            &READ_FLAGS,
            &["log", "--revision", revset, "--template", CHANGE_TEMPLATE],
        )?;
        // Graph mode orders changes by branch like the CLI; drop the glyph columns.
        let json: String = out
            .lines()
            .filter_map(|l| l.find('{').map(|i| &l[i..]))
            .map(|l| format!("{l}\n"))
            .collect();
        parse_lines(&json)
    }

    pub fn mutable_change_ids(&self) -> Result<BTreeSet<String>, String> {
        let out = self.read(
            &READ_FLAGS,
            &[
                "log",
                "--no-graph",
                "-r",
                "mutable()",
                "-T",
                r#"change_id ++ "\n""#,
            ],
        )?;
        Ok(out.lines().map(str::to_owned).collect())
    }

    pub fn op_log(&self, limit: usize) -> Result<Vec<Op>, String> {
        let limit = limit.to_string();
        let out = self.read(
            &READ_FLAGS,
            &[
                "op",
                "log",
                "--no-graph",
                "--limit",
                &limit,
                "--template",
                r#"json(self) ++ "\n""#,
            ],
        )?;
        parse_lines(&out)
    }

    pub fn diff(&self, rev: &str) -> Result<Vec<FilePair>, String> {
        let out = self.read_bytes(
            &READ_FLAGS,
            &[
                "diff",
                "--git",
                "--context",
                FULL_CONTEXT,
                "--revisions",
                rev,
            ],
        )?;
        Ok(parse_git_diff(&out))
    }

    fn command(&self, flags: &[&str]) -> Command {
        let mut cmd = Command::new("jj");
        cmd.args(flags).current_dir(&self.repo.root);
        cmd
    }

    fn read(&self, flags: &[&str], args: &[&str]) -> Result<String, String> {
        self.read_bytes(flags, args)
            .map(|out| String::from_utf8_lossy(&out).into_owned())
    }

    fn read_bytes(&self, flags: &[&str], args: &[&str]) -> Result<Vec<u8>, String> {
        let out = self
            .command(flags)
            .args(args)
            .output()
            .map_err(|e| format!("cannot run jj: {e}"))?;
        if out.status.success() {
            Ok(out.stdout)
        } else {
            Err(String::from_utf8_lossy(&out.stderr).trim().to_owned())
        }
    }
}

fn parse_lines<T: for<'de> Deserialize<'de>>(out: &str) -> Result<Vec<T>, String> {
    out.lines()
        .map(|l| serde_json::from_str(l).map_err(|e| format!("bad jj output: {e}: {l}")))
        .collect()
}

/// `--config` arguments that define `HUNK_TOOL` as `exe`, keeping only one hunk of `path`.
pub fn hunk_tool_config(exe: &Path, path: &str, digest: &str) -> Vec<String> {
    let toml_str = |s: &str| serde_json::to_string(s).expect("a string always serializes");
    let edit_args = [EDITOR_COMMAND, "$left", "$right", path, digest]
        .map(toml_str)
        .join(",");
    vec![
        "--config".into(),
        format!(
            "merge-tools.{HUNK_TOOL}.program={}",
            toml_str(&exe.to_string_lossy())
        ),
        "--config".into(),
        format!("merge-tools.{HUNK_TOOL}.edit-args=[{edit_args}]"),
    ]
}

pub fn display_command(args: &[String]) -> String {
    let quoted: Vec<String> = args.iter().map(|a| shell_quote(a)).collect();
    format!("jj {}", quoted.join(" "))
}

fn shell_quote(arg: &str) -> String {
    let plain = !arg.is_empty()
        && arg
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "-_./:=@+,%".contains(c));
    if plain {
        arg.to_owned()
    } else {
        format!("'{}'", arg.replace('\'', r"'\''"))
    }
}
