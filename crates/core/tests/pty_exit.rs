use std::path::Path;
use std::sync::mpsc;
use std::time::Duration;

use jjdo_core::pty::Pty;

#[test]
fn exit_callback_runs_when_the_shell_exits() {
    let (tx, rx) = mpsc::channel();
    let mut pty = Pty::spawn(
        "/bin/sh",
        Path::new("/tmp"),
        80,
        24,
        |_| {},
        move || tx.send(()).unwrap(),
    )
    .unwrap();

    pty.write(b"exit\n").unwrap();

    rx.recv_timeout(Duration::from_secs(10)).unwrap();
}
