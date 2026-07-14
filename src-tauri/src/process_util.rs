use std::path::Path;
use std::process::{Command, Output};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub fn hidden_command<P: AsRef<Path>>(program: P) -> Command {
    let mut command = Command::new(program.as_ref());
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    command
}

pub fn run_hidden_command_in<P: AsRef<Path>>(
    program: P,
    args: &[&str],
    working_dir: &Path,
) -> Result<Output, String> {
    let program_path = program.as_ref().to_path_buf();
    hidden_command(&program_path)
        .args(args)
        .current_dir(working_dir)
        .output()
        .map_err(|error| format!("Failed to run {}: {error}", program_path.display()))
}

/// Kill processes that are LISTENING on the given TCP port (Windows).
/// Used when Open WebUI keeps serving after the launcher loses its process handle.
#[cfg(windows)]
pub fn kill_listeners_on_port(port: u16) -> Result<usize, String> {
    let output = hidden_command("netstat")
        .args(["-ano"])
        .output()
        .map_err(|e| format!("Failed to run netstat: {e}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let needle = format!(":{}", port);
    let mut pids = std::collections::BTreeSet::new();

    for line in stdout.lines() {
        let lower = line.to_ascii_lowercase();
        if !lower.contains("listening") || !line.contains(&needle) {
            continue;
        }
        // Match "...:3000" as a port boundary (avoid :30000).
        let Some(idx) = line.find(&needle) else {
            continue;
        };
        let after = &line[idx + needle.len()..];
        let boundary_ok = after
            .chars()
            .next()
            .map(|c| c.is_whitespace())
            .unwrap_or(true);
        if !boundary_ok {
            continue;
        }
        let Some(pid_token) = line.split_whitespace().last() else {
            continue;
        };
        if let Ok(pid) = pid_token.parse::<u32>() {
            if pid > 0 {
                pids.insert(pid);
            }
        }
    }

    if pids.is_empty() {
        return Ok(0);
    }

    let mut killed = 0usize;
    for pid in pids {
        let status = hidden_command("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .status()
            .map_err(|e| format!("Failed to run taskkill for PID {pid}: {e}"))?;
        if status.success() {
            killed += 1;
        }
    }
    Ok(killed)
}

#[cfg(not(windows))]
pub fn kill_listeners_on_port(_port: u16) -> Result<usize, String> {
    Ok(0)
}
