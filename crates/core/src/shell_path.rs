use std::ffi::OsString;
use std::os::unix::ffi::OsStringExt;
use std::process::Command;
use std::sync::OnceLock;

pub(crate) fn jj_command() -> Command {
    static PATH: OnceLock<OsString> = OnceLock::new();
    let path = PATH.get_or_init(resolve);
    let mut cmd = Command::new("jj");
    cmd.env("PATH", path);
    cmd
}

fn resolve() -> OsString {
    login_shell_path().unwrap_or_else(|e| {
        eprintln!("cannot read the login shell PATH: {e}");
        std::env::var_os("PATH").unwrap_or_default()
    })
}

fn login_shell_path() -> Result<OsString, String> {
    let shell = std::env::var_os("SHELL").ok_or("SHELL is not set")?;
    let mut cmd = Command::new(&shell);
    cmd.args(["-l", "-c", r#"printf '%s\n' "$PATH""#]);
    let out = cmd.output().map_err(|e| format!("{shell:?}: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "{shell:?} exited with {}: {}",
            out.status,
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }

    let stdout = String::from_utf8_lossy(&out.stdout);
    let path = stdout
        .lines()
        .last()
        .ok_or_else(|| format!("{shell:?}: no output"))?;
    Ok(OsString::from_vec(path.as_bytes().to_vec()))
}
