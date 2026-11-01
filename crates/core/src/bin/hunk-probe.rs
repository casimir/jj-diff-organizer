//! Stand-in for the app binary as a jj diff editor, for tests:
//! `hunk-probe keep-hunk <left> <right> <path> <digest>`.
use std::process::ExitCode;

use jjdo_core::hunk::{EDITOR_COMMAND, try_editor};

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    try_editor(&args).unwrap_or_else(|| {
        eprintln!("usage: hunk-probe {EDITOR_COMMAND} <left> <right> <path> <digest>");
        ExitCode::from(2)
    })
}
