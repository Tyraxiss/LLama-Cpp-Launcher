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

/// Match only Open WebUI processes whose executable and command line belong to the configured venv.
pub fn process_details_match_open_webui(details: &str, venv_path: &Path) -> bool {
    let normalized_venv = std::fs::canonicalize(venv_path)
        .unwrap_or_else(|_| venv_path.to_path_buf())
        .to_string_lossy()
        .replace('/', "\\")
        .to_lowercase();
    let details = details.replace('/', "\\").to_lowercase();
    let mut lines = details.lines();
    let executable = lines.next().unwrap_or_default();
    let command_line = lines.next().unwrap_or_default();
    let command_line = command_line.replace('_', "-");
    let is_open_webui_command = command_line.starts_with("open-webui ")
        || command_line.contains("\\open-webui.exe ")
        || command_line.contains("-m open-webui ")
        || (command_line.contains("from importlib.metadata import entry-points;")
            && command_line.contains("ep.name")
            && command_line.contains("open-webui")
            && command_line.contains("serve"));
    if !is_open_webui_command {
        return false;
    }
    executable
        .match_indices(&normalized_venv)
        .any(|(start, _)| {
            let end = start + normalized_venv.len();
            let before_ok = start == 0
                || executable[..start]
                    .chars()
                    .next_back()
                    .is_some_and(|character| matches!(character, '\\' | ' ' | '"' | '\''));
            let after_ok = executable[end..]
                .chars()
                .next()
                .is_none_or(|character| matches!(character, '\\' | ' ' | '"' | '\''));
            before_ok && after_ok
        })
}

#[cfg(windows)]
pub fn kill_venv_listeners_on_port(port: u16, venv_path: &Path) -> Result<usize, String> {
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
        // Restrict fallback cleanup to processes whose image or command line belongs to this venv.
        let script = format!(
            "$p = Get-CimInstance Win32_Process -Filter 'ProcessId = {pid}'; if ($p) {{ Write-Output $p.ExecutablePath; Write-Output $p.CommandLine }}"
        );
        let details = hidden_command("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &script])
            .output()
            .map_err(|e| format!("Failed to inspect process {pid}: {e}"))?;
        let details = String::from_utf8_lossy(&details.stdout);
        if !process_details_match_open_webui(&details, venv_path) {
            continue;
        }

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
pub fn kill_venv_listeners_on_port(_port: u16, _venv_path: &Path) -> Result<usize, String> {
    Ok(0)
}

#[cfg(test)]
mod tests {
    use super::process_details_match_open_webui;
    use std::path::Path;

    #[test]
    fn matches_only_paths_inside_configured_venv() {
        assert!(process_details_match_open_webui(
            "C:\\Users\\me\\llama.cpp\\.venv\\Scripts\\python.exe\npython -m open_webui serve",
            Path::new(r"C:\Users\me\llama.cpp\.venv")
        ));
        assert!(process_details_match_open_webui(
            "C:\\Users\\me\\llama.cpp\\.venv\\Scripts\\open-webui.exe\nopen-webui serve",
            Path::new(r"C:\Users\me\llama.cpp\.venv")
        ));
        assert!(process_details_match_open_webui(
            "C:\\Users\\me\\llama.cpp\\.venv\\Scripts\\python.exe\npython -c from importlib.metadata import entry_points; next(ep for ep in entry_points(group='console_scripts') if ep.name == 'open-webui').load()() serve --host 127.0.0.1",
            Path::new(r"C:\Users\me\llama.cpp\.venv")
        ));
        assert!(!process_details_match_open_webui(
            "C:\\Program Files\\OtherApp\\server.exe\nother-server",
            Path::new(r"C:\Users\me\llama.cpp\.venv")
        ));
        assert!(!process_details_match_open_webui(
            "C:\\Users\\me\\llama.cpp\\.venv-other\\python.exe\nopen-webui serve",
            Path::new(r"C:\Users\me\llama.cpp\.venv")
        ));
        assert!(!process_details_match_open_webui(
            "C:\\Users\\me\\llama.cpp\\.venv\\Scripts\\python.exe\nother-app",
            Path::new(r"C:\Users\me\llama.cpp\.venv")
        ));
        assert!(!process_details_match_open_webui(
            "C:\\Users\\me\\llama.cpp\\.venv\\Scripts\\python.exe\npython -m other_open_webui_wrapper serve",
            Path::new(r"C:\Users\me\llama.cpp\.venv")
        ));
        assert!(!process_details_match_open_webui(
            "C:\\Users\\me\\llama.cpp\\.venv\\Scripts\\python.exe\npython -m some-open-webui-wrapper serve",
            Path::new(r"C:\Users\me\llama.cpp\.venv")
        ));
    }
}
