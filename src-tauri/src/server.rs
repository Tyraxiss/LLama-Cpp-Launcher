use std::path::PathBuf;
use tauri::{Emitter, Manager, State};
use tauri_plugin_shell::ShellExt;

use crate::bindings::ServerStartConfig;
use crate::resources::set_server_pid;
use crate::state::{AppState, MAX_LOG_LINES};

#[tauri::command]
pub async fn start_llama_server(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    config: ServerStartConfig,
) -> Result<String, String> {
    {
        let updating = state.llama_cpp_updating.lock().map_err(|e| e.to_string())?;
        if *updating {
            return Err(
                "Wait for the llama.cpp update to finish before starting the server.".into(),
            );
        }
    }

    let mut lock = state.child_process.lock().map_err(|e| e.to_string())?;
    if lock.is_some() {
        return Err("Server is already running. Stop it first.".into());
    }
    if !PathBuf::from(&config.exe_path).is_file() {
        return Err("Selected llama-server executable was not found.".into());
    }
    if !PathBuf::from(&config.model_path).is_file() {
        return Err("Selected model file was not found.".into());
    }
    if let Some(ref mmproj) = config.mmproj_path {
        if !mmproj.is_empty() && !PathBuf::from(mmproj).is_file() {
            return Err("Selected mmproj file was not found.".into());
        }
    }
    if let Some(ref mmproj) = config.mmproj_path {
        if !mmproj.is_empty() {
            if let (Ok(model_info), Ok(mmproj_info)) = (
                crate::gguf::read_gguf_info(PathBuf::from(&config.model_path).as_path()),
                crate::gguf::read_gguf_info(PathBuf::from(mmproj).as_path()),
            ) {
                crate::gguf::mmproj_compatible(&model_info, &mmproj_info)?;
            }
            // If metadata cannot be read, let llama.cpp do the real validation.
        }
    }

    let mut args: Vec<String> = vec![
        "-m".into(),
        config.model_path.clone(),
        "--host".into(),
        config.host.clone(),
        "--port".into(),
        config.port.to_string(),
        "-c".into(),
        config.ctx_size.to_string(),
        "-ngl".into(),
        config.ngl.to_string(),
        "--temp".into(),
        config.temp.to_string(),
        "--top-p".into(),
        format!("{:.2}", config.top_p),
        "--top-k".into(),
        config.top_k.to_string(),
        "--repeat-penalty".into(),
        format!("{:.2}", config.repeat_penalty),
        "-b".into(),
        config.batch_size.to_string(),
    ];

    if let Some(ref mmproj) = config.mmproj_path {
        if !mmproj.is_empty() {
            args.push("--mmproj".into());
            args.push(mmproj.clone());
        }
    }

    if config.min_p > 0.0 {
        args.push("--min-p".into());
        args.push(format!("{:.2}", config.min_p));
    }
    if config.presence_penalty > 0.0 {
        args.push("--presence-penalty".into());
        args.push(format!("{:.2}", config.presence_penalty));
    }
    if config.threads > 0 {
        args.push("-t".into());
        args.push(config.threads.to_string());
    }
    if config.flash_attn {
        args.push("--flash-attn".into());
        args.push("on".into());
    }
    if let Some(main_gpu) = config.main_gpu {
        args.push("--main-gpu".into());
        args.push(main_gpu.to_string());
    }
    if let Some(ref split) = config.tensor_split {
        if !split.is_empty() {
            args.push("--tensor-split".into());
            args.push(split.clone());
        }
    }
    if config.no_mmap {
        args.push("--no-mmap".into());
    }
    if config.no_webui {
        args.push("--no-webui".into());
    }
    args.push("--metrics".into());

    let shell = app_handle.shell();
    let (rx, child) = shell
        .command(&config.exe_path)
        .args(&args)
        .spawn()
        .map_err(|e| format!("Failed to launch server: {}", e))?;

    let app_clone = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        use tauri_plugin_shell::process::CommandEvent;
        let mut rx = rx;
        while let Some(event) = rx.recv().await {
            let line: Option<String> = match &event {
                CommandEvent::Stderr(bytes) => Some(String::from_utf8_lossy(bytes).into_owned()),
                CommandEvent::Error(msg) => Some(msg.clone()),
                _ => None,
            };

            if let Some(ref text) = line {
                if let Some(state) = app_clone.try_state::<AppState>() {
                    if let Ok(mut log) = state.stderr_log.lock() {
                        log.push(text.clone());
                        if log.len() > MAX_LOG_LINES {
                            let extra = log.len() - MAX_LOG_LINES;
                            log.drain(0..extra);
                        }
                    }
                }
                let _ = app_clone.emit("server-stderr", text);
            }

            if let CommandEvent::Terminated(payload) = event {
                if let Some(state) = app_clone.try_state::<AppState>() {
                    if let Ok(mut child_lock) = state.child_process.lock() {
                        let _ = child_lock.take();
                    }
                    set_server_pid(&state.server_pid, None);
                }
                let _ = app_clone.emit("server-exited", format!("{:?}", payload));
                break;
            }
        }
    });

    let pid = child.pid();
    set_server_pid(&state.server_pid, Some(pid));
    *lock = Some(child);
    Ok(format!("Server started on {}:{}", config.host, config.port))
}

#[tauri::command]
pub fn stop_llama_server(state: State<'_, AppState>) -> Result<String, String> {
    let mut lock = state.child_process.lock().map_err(|e| e.to_string())?;
    if let Some(child) = lock.take() {
        child
            .kill()
            .map_err(|e| format!("Failed to kill process: {}", e))?;
        set_server_pid(&state.server_pid, None);
        Ok("Server stopped".into())
    } else {
        Err("No server running".into())
    }
}

#[tauri::command]
pub fn get_server_log(state: State<'_, AppState>) -> Vec<String> {
    state
        .stderr_log
        .lock()
        .map(|log| log.clone())
        .unwrap_or_default()
}

#[tauri::command]
pub fn clear_server_log(state: State<'_, AppState>) {
    if let Ok(mut log) = state.stderr_log.lock() {
        log.clear();
    }
}
