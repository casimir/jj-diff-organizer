use std::path::Path;
use std::process::Command;
use std::sync::mpsc;
use std::time::Duration;

use jjdo_core::diff::Status;
use jjdo_core::generated::generated_paths;
use jjdo_core::hunk::{HunkOp, hunk_keys};
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

/// Two sibling changes on top of `base`: `target` (empty) and `source`, which turns `old` into `new`.
fn source_repo(old: &str, new: &str) -> TempDir {
    let dir = init_repo();
    let p = dir.path();

    std::fs::write(p.join("a.txt"), old).unwrap();
    jj_ok(p, &["describe", "-m", "base"]);
    jj_ok(p, &["bookmark", "create", "base"]);
    jj_ok(p, &["new", "base", "-m", "target"]);
    jj_ok(p, &["bookmark", "create", "target"]);
    jj_ok(p, &["new", "base", "-m", "source"]);
    jj_ok(p, &["bookmark", "create", "source"]);
    std::fs::write(p.join("a.txt"), new).unwrap();
    jj_ok(p, &["status"]);
    dir
}

/// `source_repo` with two separate edits.
fn two_hunk_repo() -> (TempDir, String, String) {
    let old = numbered(&[]);
    let new = numbered(&[(2, "edited 2"), (18, "edited 18")]);
    (source_repo(&old, &new), old, new)
}

fn squash_hunk(dir: &Path, key: &str) -> std::process::Output {
    squash_hunk_into(dir, "target", key)
}

fn squash_hunk_into(dir: &Path, into: &str, key: &str) -> std::process::Output {
    squash_hunk_to(dir, &["--into", into, "--use-destination-message"], key)
}

fn squash_hunk_to(dir: &Path, destination: &[&str], key: &str) -> std::process::Output {
    let probe = env!("CARGO_BIN_EXE_hunk-probe");
    Command::new("jj")
        .args(["--no-pager", "--color=never"])
        .args(hunk_tool_config(
            Path::new(probe),
            HunkOp::Keep,
            "a.txt",
            key,
        ))
        .args(["squash", "--from", "source"])
        .args(destination)
        .args(["--tool", HUNK_TOOL])
        .current_dir(dir)
        .env("JJ_USER", "test")
        .env("JJ_EMAIL", "test@example.com")
        .output()
        .unwrap()
}

fn revert_hunk(dir: &Path, key: &str) -> std::process::Output {
    let probe = env!("CARGO_BIN_EXE_hunk-probe");
    Command::new("jj")
        .args(["--no-pager", "--color=never"])
        .args(hunk_tool_config(
            Path::new(probe),
            HunkOp::Revert,
            "a.txt",
            key,
        ))
        .args(["diffedit", "-r", "source", "--tool", HUNK_TOOL, "a.txt"])
        .current_dir(dir)
        .env("JJ_USER", "test")
        .env("JJ_EMAIL", "test@example.com")
        .output()
        .unwrap()
}

#[test]
fn diffedit_tool_reverts_only_the_selected_hunk() {
    let (dir, old, new) = two_hunk_repo();
    let p = dir.path();
    let keys = hunk_keys(&old, &new);

    let out = revert_hunk(p, &keys[0]);
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );

    assert_eq!(
        jj_ok(p, &["file", "show", "-r", "source", "a.txt"]),
        numbered(&[(18, "edited 18")])
    );
}

#[test]
fn squash_tool_moves_only_the_selected_hunk() {
    let (dir, old, new) = two_hunk_repo();
    let p = dir.path();
    let keys = hunk_keys(&old, &new);
    assert_eq!(keys.len(), 2);

    let out = squash_hunk(p, &keys[0]);
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
fn squash_tool_moves_the_second_of_two_identical_hunks() {
    let old = "k\nk\nk\nx\nk\nk\nk\nx\nk\nk\nk\n";
    let new = old.replace('x', "X");
    let dir = source_repo(old, &new);
    let p = dir.path();
    let keys = hunk_keys(old, &new);
    assert_eq!(keys.len(), 2);

    let out = squash_hunk(p, &keys[1]);
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );

    assert_eq!(
        jj_ok(p, &["file", "show", "-r", "target", "a.txt"]),
        "k\nk\nk\nx\nk\nk\nk\nX\nk\nk\nk\n"
    );
    assert_eq!(
        jj_ok(p, &["file", "show", "-r", "source", "a.txt"]),
        "k\nk\nk\nX\nk\nk\nk\nx\nk\nk\nk\n"
    );
}

#[test]
fn squash_tool_moves_a_hunk_from_a_parent_into_the_working_copy() {
    let (dir, old, new) = two_hunk_repo();
    let p = dir.path();
    let keys = hunk_keys(&old, &new);
    jj_ok(p, &["new", "source"]);

    let out = squash_hunk_into(p, "@", &keys[0]);
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );

    assert_eq!(
        jj_ok(p, &["file", "show", "-r", "@", "a.txt"]),
        numbered(&[(2, "edited 2"), (18, "edited 18")])
    );
    assert_eq!(
        jj_ok(p, &["file", "show", "-r", "source", "a.txt"]),
        numbered(&[(18, "edited 18")])
    );
}

#[test]
fn squash_tool_moves_only_the_selected_hunk_into_a_new_change_before_the_target() {
    let (dir, old, new) = two_hunk_repo();
    let p = dir.path();
    let keys = hunk_keys(&old, &new);

    let out = squash_hunk_to(p, &["--insert-before", "target"], &keys[0]);
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );

    let inserted = jj_ok(
        p,
        &[
            "log",
            "--no-graph",
            "-r",
            "target- & children(base)",
            "-T",
            "change_id",
        ],
    );
    assert!(
        !inserted.is_empty(),
        "no new change between base and target"
    );
    assert_eq!(
        jj_ok(p, &["file", "show", "-r", "target-", "a.txt"]),
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

    let out = squash_hunk(p, "stale-key");

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

    let pairs = Jj::new(Repo::discover(p).unwrap()).diff("@").unwrap().pairs;

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
fn generated_files_follow_the_gitattributes_of_the_diffed_change() {
    let dir = init_repo();
    let p = dir.path();
    std::fs::create_dir_all(p.join("gen")).unwrap();
    for name in [
        "Cargo.lock",
        "gen/out.rs",
        "keep.rs",
        "pubspec.lock",
        "src.rs",
    ] {
        std::fs::write(p.join(name), "x\n").unwrap();
    }
    jj_ok(p, &["commit", "-m", "before"]);
    std::fs::write(
        p.join(".gitattributes"),
        "Cargo.lock linguist-generated=true\npubspec.lock gitlab-generated\nkeep.rs -linguist-generated\n",
    )
    .unwrap();
    std::fs::write(p.join("gen/.gitattributes"), "* linguist-generated\n").unwrap();
    std::fs::write(p.join("src.rs"), "y\n").unwrap();
    jj_ok(p, &["commit", "-m", "attrs"]);
    let jj = Jj::new(Repo::discover(p).unwrap());
    assert!(jj.repo().git_dir.is_some(), "git 2.40 or newer is required");
    let paths = [
        "Cargo.lock",
        "gen/out.rs",
        "keep.rs",
        "pubspec.lock",
        "src.rs",
    ];

    let with_attrs = jj.diff("@-").unwrap();
    let before = jj.diff("@--").unwrap();

    let found = generated_paths(jj.repo(), &with_attrs.commit_id, &paths).unwrap();
    assert_eq!(
        found,
        ["Cargo.lock", "gen/out.rs", "pubspec.lock"]
            .map(String::from)
            .into()
    );
    let found = generated_paths(jj.repo(), &before.commit_id, &paths).unwrap();
    assert!(found.is_empty());
}

#[test]
fn a_pure_rename_keeps_its_source_path_and_has_no_content_change() {
    let dir = init_repo();
    let p = dir.path();
    std::fs::write(p.join("old.txt"), "one\ntwo\n").unwrap();
    jj_ok(p, &["commit", "-m", "base"]);
    std::fs::rename(p.join("old.txt"), p.join("new.txt")).unwrap();
    jj_ok(p, &["status"]);

    let pairs = Jj::new(Repo::discover(p).unwrap()).diff("@").unwrap().pairs;

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

fn change_id(dir: &Path, rev: &str) -> String {
    jj_ok(dir, &["log", "--no-graph", "-r", rev, "-T", "change_id"])
}

#[test]
fn successors_follow_a_squash_but_not_an_abandon() {
    let (dir, old, new) = two_hunk_repo();
    let p = dir.path();
    let jj = Jj::new(Repo::discover(p).unwrap());
    let source = change_id(p, "source");
    let target = change_id(p, "target");
    let keys = hunk_keys(&old, &new);

    assert!(jj.successors("all()", &source).unwrap().is_empty());

    let out = squash_hunk(p, &keys[0]);
    assert!(out.status.success());
    assert_eq!(jj.successors("all()", &source).unwrap(), [target]);

    jj_ok(p, &["abandon", "source"]);
    assert!(
        jj.successors("all()", &change_id(p, "target"))
            .unwrap()
            .is_empty()
    );
}

#[test]
fn divergent_commits_get_the_cli_ids_that_resolve_to_each_of_them() {
    let dir = init_repo();
    let p = dir.path();
    let jj = Jj::new(Repo::discover(p).unwrap());
    let before = jj_ok(p, &["op", "log", "--no-graph", "-n1", "-T", "id.short()"]);
    jj_ok(p, &["describe", "-m", "one"]);
    jj_ok(p, &["--at-op", &before, "describe", "-m", "two"]);
    // The concurrent op heads are only merged by the next regular command; reads pin `--at-op=@`.
    jj_ok(p, &["log", "--no-graph", "-T", ""]);

    let divergent: Vec<_> = jj
        .graph("all()")
        .unwrap()
        .into_iter()
        .filter(|c| c.divergent)
        .collect();

    assert_eq!(divergent.len(), 2);
    assert_ne!(divergent[0].change_id, divergent[1].change_id);
    for change in &divergent {
        assert!(change.change_id.contains('/'));
        assert_eq!(
            jj.diff(&change.change_id).unwrap().commit_id,
            change.commit_id
        );
    }
}

#[test]
fn successors_reject_an_id_that_would_break_out_of_the_template() {
    let dir = init_repo();
    let jj = Jj::new(Repo::discover(dir.path()).unwrap());

    assert!(jj.successors("all()", "x\") ++ \"").is_err());
}
