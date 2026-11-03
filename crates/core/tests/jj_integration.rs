use std::path::Path;
use std::process::Command;
use std::sync::mpsc;
use std::time::Duration;

use jjdo_core::diff::Status;
use jjdo_core::hunk::hunk_digests;
use jjdo_core::jj::{HUNK_TOOL, Jj, hunk_tool_config};
use jjdo_core::repo::Repo;
use jjdo_core::watch::OpWatch;
use tempfile::TempDir;

fn jj(dir: &Path, args: &[&str]) -> std::process::Output {
    Command::new("jj")
        .args(["--no-pager", "--color=never"])
        .args(args)
        .current_dir(dir)
        .env("JJ_USER", "test")
        .env("JJ_EMAIL", "test@example.com")
        .output()
        .unwrap()
}

fn jj_ok(dir: &Path, args: &[&str]) -> String {
    let out = jj(dir, args);
    assert!(
        out.status.success(),
        "jj {args:?} failed: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8_lossy(&out.stdout).into_owned()
}

fn init_repo() -> TempDir {
    let dir = tempfile::tempdir().unwrap();
    jj_ok(dir.path(), &["git", "init", "."]);
    dir
}

fn numbered(edits: &[(usize, &str)]) -> String {
    (1..=20)
        .map(|n| match edits.iter().find(|(i, _)| *i == n) {
            Some((_, text)) => format!("{text}\n"),
            None => format!("line {n}\n"),
        })
        .collect()
}

/// Two sibling changes on top of `base`: `target` (empty) and `source` (two separate edits).
fn two_hunk_repo() -> (TempDir, String, String) {
    let dir = init_repo();
    let p = dir.path();
    let old = numbered(&[]);
    let new = numbered(&[(2, "edited 2"), (18, "edited 18")]);

    std::fs::write(p.join("a.txt"), &old).unwrap();
    jj_ok(p, &["describe", "-m", "base"]);
    jj_ok(p, &["bookmark", "create", "base"]);
    jj_ok(p, &["new", "base", "-m", "target"]);
    jj_ok(p, &["bookmark", "create", "target"]);
    jj_ok(p, &["new", "base", "-m", "source"]);
    jj_ok(p, &["bookmark", "create", "source"]);
    std::fs::write(p.join("a.txt"), &new).unwrap();
    jj_ok(p, &["status"]);
    (dir, old, new)
}

fn squash_hunk(dir: &Path, digest: &str) -> std::process::Output {
    let probe = env!("CARGO_BIN_EXE_hunk-probe");
    Command::new("jj")
        .args(["--no-pager", "--color=never"])
        .args(hunk_tool_config(Path::new(probe), "a.txt", digest))
        .args([
            "squash",
            "--from",
            "source",
            "--into",
            "target",
            "--use-destination-message",
            "--tool",
            HUNK_TOOL,
        ])
        .current_dir(dir)
        .env("JJ_USER", "test")
        .env("JJ_EMAIL", "test@example.com")
        .output()
        .unwrap()
}

#[test]
fn squash_tool_moves_only_the_selected_hunk() {
    let (dir, old, new) = two_hunk_repo();
    let p = dir.path();
    let digests = hunk_digests(&old, &new);
    assert_eq!(digests.len(), 2);

    let out = squash_hunk(p, &digests[0]);
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );

    assert_eq!(
        jj_ok(p, &["file", "show", "-r", "target", "a.txt"]),
        numbered(&[(2, "edited 2")])
    );
    assert_eq!(
        jj_ok(p, &["file", "show", "-r", "source", "a.txt"]),
        numbered(&[(18, "edited 18")])
    );
}

#[test]
fn squash_tool_fails_without_touching_the_repo_when_the_hunk_changed() {
    let (dir, _, _) = two_hunk_repo();
    let p = dir.path();
    let repo = Repo::discover(p).unwrap();
    let heads = repo.op_heads().unwrap();

    let out = squash_hunk(p, "stale-digest");

    assert!(!out.status.success());
    assert_eq!(repo.op_heads().unwrap(), heads);
}

#[test]
fn secondary_workspace_resolves_the_shared_repo_and_sees_its_operations() {
    let main = init_repo();
    let ws = tempfile::tempdir().unwrap();
    let ws_path = ws.path().join("second");
    jj_ok(
        main.path(),
        &["workspace", "add", ws_path.to_str().unwrap()],
    );

    let main_repo = Repo::discover(main.path()).unwrap();
    let ws_repo = Repo::discover(&ws_path).unwrap();
    assert_eq!(ws_repo.repo_dir, main_repo.repo_dir);

    let (tx, rx) = mpsc::channel();
    let _watch = OpWatch::start(ws_repo, move |heads| {
        let _ = tx.send(heads);
    })
    .unwrap();
    jj_ok(main.path(), &["describe", "-m", "from the main workspace"]);

    let heads = rx.recv_timeout(Duration::from_secs(10)).unwrap();
    assert_eq!(heads, main_repo.op_heads().unwrap());
}

#[test]
fn parsed_diff_rebuilds_both_sides_exactly_as_jj_stores_them() {
    let dir = init_repo();
    let p = dir.path();
    let write = |name: &str, bytes: &[u8]| std::fs::write(p.join(name), bytes).unwrap();
    write("modified.txt", b"one\ntwo\n");
    write("deleted.txt", b"gone\n");
    write("no_eol_both.txt", b"x");
    write("eol_lost.txt", b"p\n");
    write("crlf.txt", b"a\r\nb\r\n");
    write("bin.dat", b"a\0b");
    jj_ok(p, &["commit", "-m", "base"]);

    write("modified.txt", b"one\nchanged\n");
    std::fs::remove_file(p.join("deleted.txt")).unwrap();
    write("added.txt", b"new\n");
    write("no_eol_both.txt", b"y");
    write("eol_lost.txt", b"p\nq");
    write("crlf.txt", b"a\r\nc\r\n");
    write("bin.dat", b"a\0c");
    jj_ok(p, &["status"]);

    let pairs = Jj::new(Repo::discover(p).unwrap()).diff("@").unwrap();

    assert_eq!(pairs.len(), 7);
    for pair in &pairs {
        if pair.binary {
            assert_eq!(pair.path, "bin.dat");
            assert!(pair.blob.is_some());
            continue;
        }
        let old = if pair.status == Status::Added {
            String::new()
        } else {
            jj_ok(p, &["file", "show", "-r", "@-", &pair.path])
        };
        let new = if pair.status == Status::Deleted {
            String::new()
        } else {
            jj_ok(p, &["file", "show", "-r", "@", &pair.path])
        };
        assert_eq!(
            (&pair.old_content, &pair.content),
            (&old, &new),
            "{}",
            pair.path
        );
    }
    let status_of = |name: &str| pairs.iter().find(|f| f.path == name).unwrap().status;
    assert_eq!(status_of("added.txt"), Status::Added);
    assert_eq!(status_of("deleted.txt"), Status::Deleted);
    assert_eq!(status_of("modified.txt"), Status::Modified);
}

#[test]
fn a_pure_rename_keeps_its_source_path_and_has_no_content_change() {
    let dir = init_repo();
    let p = dir.path();
    std::fs::write(p.join("old.txt"), "one\ntwo\n").unwrap();
    jj_ok(p, &["commit", "-m", "base"]);
    std::fs::rename(p.join("old.txt"), p.join("new.txt")).unwrap();
    jj_ok(p, &["status"]);

    let pairs = Jj::new(Repo::discover(p).unwrap()).diff("@").unwrap();

    assert_eq!(pairs.len(), 1);
    assert_eq!(pairs[0].status, Status::Renamed);
    assert_eq!(pairs[0].path, "new.txt");
    assert_eq!(pairs[0].old_path.as_deref(), Some("old.txt"));
    assert_eq!(pairs[0].old_content, pairs[0].content);
}

#[test]
fn op_log_reads_every_op_including_the_root_at_epoch_zero() {
    let dir = init_repo();
    let jj = Jj::new(Repo::discover(dir.path()).unwrap());

    let ops = jj.op_log(100).unwrap();

    let root = ops.last().unwrap();
    assert_eq!(root.start_ms, 0);
    assert!(ops[0].start_ms > 0);
}
