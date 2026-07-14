use std::path::{Path, PathBuf};

use serde::Deserialize;
use tauri::{Emitter, Manager, State};
use tauri_plugin_shell::ShellExt;

use crate::bindings::OpenWebUiStartConfig;
use crate::config::{open_webui_executable, open_webui_python};
use crate::process_util::run_hidden_command_in;
use crate::state::{AppState, MAX_LOG_LINES};

fn validate_open_webui_venv(venv_path: &Path) -> Result<PathBuf, String> {
    if !venv_path.is_dir() {
        return Err("Selected Open WebUI venv folder was not found.".into());
    }

    let python = open_webui_python(venv_path);
    if !python.is_file() {
        return Err("Python was not found in the selected venv.".into());
    }

    if !open_webui_executable(venv_path).is_file() {
        return Err("open-webui executable was not found in the selected venv.".into());
    }

    Ok(python)
}

pub fn parse_open_webui_version_from_pip_show(text: &str) -> Result<String, String> {
    text.lines()
        .find(|line| line.starts_with("Version:"))
        .map(|line| line.trim_start_matches("Version:").trim().to_string())
        .filter(|version| !version.is_empty())
        .ok_or_else(|| "Could not read open-webui version.".into())
}

fn read_open_webui_version(venv_path: &Path) -> Result<String, String> {
    let python = validate_open_webui_venv(venv_path)?;
    let output = run_hidden_command_in(&python, &["-m", "pip", "show", "open-webui"], venv_path)?;

    if !output.status.success() {
        return Err("open-webui is not installed in this venv.".into());
    }

    parse_open_webui_version_from_pip_show(&String::from_utf8_lossy(&output.stdout))
}

fn append_open_webui_log(app_handle: &tauri::AppHandle, line: &str) {
    if let Some(state) = app_handle.try_state::<AppState>() {
        if let Ok(mut log) = state.open_webui_log.lock() {
            log.push(line.to_string());
            if log.len() > MAX_LOG_LINES {
                let extra = log.len() - MAX_LOG_LINES;
                log.drain(0..extra);
            }
        }
    }
    let _ = app_handle.emit("open-webui-log", line);
}

#[tauri::command]
pub fn get_open_webui_version(venv_path: String) -> Result<String, String> {
    read_open_webui_version(Path::new(&venv_path))
}

#[tauri::command]
pub async fn get_open_webui_latest_version() -> Result<String, String> {
    #[derive(Deserialize)]
    struct PyPiResponse {
        info: PyPiInfo,
    }

    #[derive(Deserialize)]
    struct PyPiInfo {
        version: String,
    }

    let response = reqwest::get("https://pypi.org/pypi/open-webui/json")
        .await
        .map_err(|e| format!("Failed to reach PyPI: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "PyPI lookup failed: HTTP {}",
            response.status().as_u16()
        ));
    }

    let payload: PyPiResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse PyPI response: {}", e))?;

    Ok(payload.info.version)
}

#[tauri::command]
pub async fn update_open_webui(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    venv_path: String,
) -> Result<String, String> {
    {
        let lock = state.open_webui_process.lock().map_err(|e| e.to_string())?;
        if lock.is_some() {
            return Err("Stop Open WebUI before updating.".into());
        }
    }

    {
        let mut updating = state
            .open_webui_updating
            .lock()
            .map_err(|e| e.to_string())?;
        if *updating {
            return Err("An Open WebUI update is already in progress.".into());
        }
        *updating = true;
    }

    let venv = PathBuf::from(&venv_path);
    let python = match validate_open_webui_venv(&venv) {
        Ok(python) => python,
        Err(error) => {
            if let Ok(mut updating) = state.open_webui_updating.lock() {
                *updating = false;
            }
            return Err(error);
        }
    };

    append_open_webui_log(&app_handle, "Updating open-webui with pip...");

    let result = async {
        let shell = app_handle.shell();
        let (mut rx, _child) = shell
            .command(python.to_string_lossy().to_string())
            .args(["-m", "pip", "install", "--upgrade", "open-webui"])
            .current_dir(&venv)
            .spawn()
            .map_err(|e| format!("Failed to start pip upgrade: {}", e))?;

        use tauri_plugin_shell::process::CommandEvent;

        let mut succeeded = false;
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) | CommandEvent::Stderr(bytes) => {
                    let text = String::from_utf8_lossy(&bytes).trim().to_string();
                    if !text.is_empty() {
                        append_open_webui_log(&app_handle, &text);
                    }
                }
                CommandEvent::Error(message) => {
                    return Err(message);
                }
                CommandEvent::Terminated(payload) => {
                    if payload.code == Some(0) {
                        succeeded = true;
                        break;
                    }
                    return Err(format!(
                        "pip upgrade failed{}",
                        payload
                            .code
                            .map(|code| format!(" (exit code {code})"))
                            .unwrap_or_else(|| " (terminated without exit code)".into())
                    ));
                }
                _ => {}
            }
        }

        if !succeeded {
            return Err("pip upgrade ended without a successful exit status.".into());
        }

        let version = read_open_webui_version(&venv)?;
        append_open_webui_log(
            &app_handle,
            &format!("open-webui updated to version {version}"),
        );
        Ok(format!("Open WebUI updated to v{version}"))
    }
    .await;

    match state.open_webui_updating.lock() {
        Ok(mut updating) => *updating = false,
        Err(poisoned) => *poisoned.into_inner() = false,
    }

    result
}

#[tauri::command]
pub async fn start_open_webui(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    config: OpenWebUiStartConfig,
) -> Result<String, String> {
    {
        let updating = state
            .open_webui_updating
            .lock()
            .map_err(|e| e.to_string())?;
        if *updating {
            return Err("Wait for the Open WebUI update to finish before starting.".into());
        }
    }

    let mut lock = state.open_webui_process.lock().map_err(|e| e.to_string())?;
    if lock.is_some() {
        return Err("Open WebUI is already running. Stop it first.".into());
    }

    let venv_path = PathBuf::from(&config.venv_path);
    if !venv_path.is_dir() {
        return Err("Selected Open WebUI venv folder was not found.".into());
    }

    let exe_path = open_webui_executable(&venv_path);
    if !exe_path.is_file() {
        return Err("open-webui executable was not found in the selected venv.".into());
    }

    let llama_base_url = format!("http://{}:{}/v1", config.llama_host, config.llama_port);
    let webui_url = format!("http://{}:{}", config.host, config.port);
    let args = vec![
        "serve".to_string(),
        "--host".to_string(),
        config.host.clone(),
        "--port".to_string(),
        config.port.to_string(),
    ];

    let shell = app_handle.shell();
    let (rx, child) = shell
        .command(exe_path.to_string_lossy().to_string())
        .args(&args)
        .current_dir(&venv_path)
        .env("OPENAI_API_BASE_URLS", &llama_base_url)
        .env("OPENAI_API_KEYS", "sk-local")
        .env("ENABLE_OLLAMA_API", "False")
        .env("CORS_ALLOW_ORIGIN", "*")
        .env("USER_AGENT", "LLama C++ Launcher/1.0.9")
        .env("PYTHONUTF8", "1")
        .env("PYTHONIOENCODING", "utf-8")
        .spawn()
        .map_err(|e| format!("Failed to launch Open WebUI: {}", e))?;

    let app_clone = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        use tauri_plugin_shell::process::CommandEvent;
        let mut rx = rx;
        while let Some(event) = rx.recv().await {
            let line: Option<String> = match &event {
                CommandEvent::Stdout(bytes) => Some(String::from_utf8_lossy(bytes).into_owned()),
                CommandEvent::Stderr(bytes) => Some(String::from_utf8_lossy(bytes).into_owned()),
                CommandEvent::Error(msg) => Some(msg.clone()),
                _ => None,
            };

            if let Some(ref text) = line {
                if let Some(state) = app_clone.try_state::<AppState>() {
                    if let Ok(mut log) = state.open_webui_log.lock() {
                        log.push(text.clone());
                        if log.len() > MAX_LOG_LINES {
                            let extra = log.len() - MAX_LOG_LINES;
                            log.drain(0..extra);
                        }
                    }
                }
                let _ = app_clone.emit("open-webui-log", text);
            }

            if let CommandEvent::Terminated(payload) = event {
                if let Some(state) = app_clone.try_state::<AppState>() {
                    if let Ok(mut child_lock) = state.open_webui_process.lock() {
                        let _ = child_lock.take();
                    }
                }
                let _ = app_clone.emit("open-webui-exited", format!("{:?}", payload));
                break;
            }
        }
    });

    *lock = Some(child);
    Ok(format!(
        "Open WebUI started on {} and connected to {}",
        webui_url, llama_base_url
    ))
}

#[tauri::command]
pub fn stop_open_webui(state: State<'_, AppState>, port: Option<u16>) -> Result<String, String> {
    let mut lock = state.open_webui_process.lock().map_err(|e| e.to_string())?;
    if let Some(child) = lock.take() {
        child
            .kill()
            .map_err(|e| format!("Failed to kill Open WebUI process: {}", e))?;
        // Also clear any leftover listeners (open-webui can respawn workers).
        if let Some(port) = port {
            let _ = crate::process_util::kill_listeners_on_port(port);
        }
        return Ok("Open WebUI stopped".into());
    }

    let Some(port) = port else {
        return Err("Open WebUI is not managed by the launcher".into());
    };

    let killed = crate::process_util::kill_listeners_on_port(port)?;
    if killed == 0 {
        return Err(format!(
            "No Open WebUI process handle, and nothing is listening on port {port}."
        ));
    }
    Ok(format!(
        "Open WebUI was no longer tracked, but stopped {killed} process(es) on port {port}."
    ))
}

#[tauri::command]
pub fn get_open_webui_log(state: State<'_, AppState>) -> Vec<String> {
    state
        .open_webui_log
        .lock()
        .map(|log| log.clone())
        .unwrap_or_default()
}

#[tauri::command]
pub fn clear_open_webui_log(state: State<'_, AppState>) {
    if let Ok(mut log) = state.open_webui_log.lock() {
        log.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::parse_open_webui_version_from_pip_show;

    #[test]
    fn parse_pip_show_version_line() {
        let output = "Name: open-webui\nVersion: 0.6.15\nSummary: Open WebUI\n";
        assert_eq!(
            parse_open_webui_version_from_pip_show(output).unwrap(),
            "0.6.15"
        );
    }
}
