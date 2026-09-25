use std::net::IpAddr;
use std::path::PathBuf;
use tauri::{Emitter, Manager, State};
use tauri_plugin_shell::ShellExt;

use crate::bindings::ServerStartConfig;
use crate::resources::set_server_pid;
use crate::state::{AppState, MAX_LOG_LINES};

fn append_memory_load_args(args: &mut Vec<String>, no_mmap: bool) {
    if no_mmap {
        args.push("--load-mode".into());
        args.push("none".into());
    }
}

fn validate_start_config(config: &ServerStartConfig) -> Result<(), String> {
    let host = config.host.trim();
    if host != config.host {
        return Err("Host must not contain leading or trailing whitespace.".into());
    }
    if !host.eq_ignore_ascii_case("localhost") {
        match host.parse::<IpAddr>() {
            Ok(IpAddr::V4(_)) => {}
            Ok(IpAddr::V6(_)) => {
                return Err("IPv6 bind addresses are not currently supported by this UI.".into())
            }
            Err(_) => return Err("Host must be localhost or a valid IPv4 bind address.".into()),
        }
    }
    if !(1024..=65535).contains(&config.port) {
        return Err("Port must be between 1024 and 65535.".into());
    }
    if !(256..=131072).contains(&config.ctx_size) {
        return Err("Context length must be between 256 and 131072.".into());
    }
    if config.ngl > 999 {
        return Err("GPU layers must be between 0 and 999.".into());
    }
    if config.threads > 256 {
        return Err("CPU threads must be between 0 and 256.".into());
    }
    if !(64..=4096).contains(&config.batch_size) {
        return Err("Batch size must be between 64 and 4096.".into());
    }
    if !config.temp.is_finite() || !(0.0..=2.0).contains(&config.temp) {
        return Err("Temperature must be between 0 and 2.".into());
    }
    if !config.top_p.is_finite() || !(0.0..=1.0).contains(&config.top_p) {
        return Err("Top-P must be between 0 and 1.".into());
    }
    if !(1..=200).contains(&config.top_k) {
        return Err("Top-K must be between 1 and 200.".into());
    }
    if !config.min_p.is_finite() || !(0.0..=0.2).contains(&config.min_p) {
        return Err("Min-P must be between 0 and 0.2.".into());
    }
    if !config.repeat_penalty.is_finite() || !(1.0..=2.0).contains(&config.repeat_penalty) {
        return Err("Repeat penalty must be between 1 and 2.".into());
    }
    if !config.presence_penalty.is_finite() || !(0.0..=2.0).contains(&config.presence_penalty) {
        return Err("Presence penalty must be between 0 and 2.".into());
    }
    if config.main_gpu.is_some_and(|gpu| gpu > 31) {
        return Err("Main GPU must be between 0 and 31.".into());
    }
    if let Some(split) = config
        .tensor_split
        .as_deref()
        .filter(|split| !split.trim().is_empty())
    {
        let values: Result<Vec<f32>, _> = split
            .split(',')
            .map(|part| {
                let part = part.trim();
                let valid_format = !part.is_empty()
                    && part
                        .chars()
                        .all(|character| character.is_ascii_digit() || ".+-eE".contains(character))
                    && part.chars().any(|character| character.is_ascii_digit());
                if !valid_format {
                    return Err(());
                }
                part.parse::<f32>().map_err(|_| ())
            })
            .collect();
        let values = values.map_err(|_| {
            "Tensor split must be comma-separated non-negative numbers.".to_string()
        })?;
        if values.is_empty()
            || values.len() > 16
            || values
                .iter()
                .any(|value| !value.is_finite() || *value < 0.0)
            || !values.iter().any(|value| *value > 0.0)
        {
            return Err("Tensor split must contain up to 16 non-negative numbers and at least one value above zero.".into());
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn start_llama_server(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    config: ServerStartConfig,
) -> Result<String, String> {
    validate_start_config(&config)?;

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
        if !split.trim().is_empty() {
            args.push("--tensor-split".into());
            args.push(split.trim().to_string());
        }
    }
    append_memory_load_args(&mut args, config.no_mmap);
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

    let pid = child.pid();
    set_server_pid(&state.server_pid, Some(pid));
    *state
        .managed_server_endpoint
        .lock()
        .map_err(|e| e.to_string())? = Some((config.host.clone(), config.port));
    *lock = Some(child);

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
                    if let Ok(mut endpoint) = state.managed_server_endpoint.lock() {
                        *endpoint = None;
                    }
                }
                let _ = app_clone.emit("server-exited", format!("{:?}", payload));
                break;
            }
        }
    });

    Ok(format!("Server started on {}:{}", config.host, config.port))
}

#[cfg(test)]
mod validation_tests {
    use super::{append_memory_load_args, validate_start_config};
    use crate::bindings::ServerStartConfig;

    fn valid_config() -> ServerStartConfig {
        ServerStartConfig {
            exe_path: "server".into(),
            model_path: "model.gguf".into(),
            mmproj_path: None,
            host: "127.0.0.1".into(),
            port: 8080,
            ctx_size: 8192,
            ngl: 99,
            temp: 0.7,
            threads: 0,
            batch_size: 512,
            flash_attn: false,
            top_p: 0.9,
            top_k: 40,
            min_p: 0.05,
            repeat_penalty: 1.1,
            presence_penalty: 0.0,
            main_gpu: None,
            tensor_split: None,
            no_mmap: false,
            no_webui: false,
        }
    }

    #[test]
    fn uses_current_load_mode_flag_when_memory_mapping_is_disabled() {
        let mut args = Vec::new();
        append_memory_load_args(&mut args, true);
        assert_eq!(args, ["--load-mode", "none"]);

        let mut args = Vec::new();
        append_memory_load_args(&mut args, false);
        assert!(args.is_empty());
    }

    #[test]
    fn accepts_loopback_and_network_ipv4_bind_addresses() {
        assert!(validate_start_config(&valid_config()).is_ok());
        let mut config = valid_config();
        config.host = "0.0.0.0".into();
        assert!(validate_start_config(&config).is_ok());
        config.host = "::1".into();
        assert!(validate_start_config(&config).unwrap_err().contains("IPv6"));
        config.host = "invalid host".into();
        assert!(validate_start_config(&config).unwrap_err().contains("Host"));
        config.host = " 127.0.0.1 ".into();
        assert!(validate_start_config(&config)
            .unwrap_err()
            .contains("whitespace"));
    }

    #[test]
    fn rejects_invalid_ranges_and_non_finite_values() {
        let mut config = valid_config();
        config.ctx_size = 0;
        assert!(validate_start_config(&config)
            .unwrap_err()
            .contains("Context"));
        config = valid_config();
        config.temp = f32::NAN;
        assert!(validate_start_config(&config)
            .unwrap_err()
            .contains("Temperature"));
        config = valid_config();
        config.tensor_split = Some("0.5,-0.1".into());
        assert!(validate_start_config(&config)
            .unwrap_err()
            .contains("Tensor split"));
        config.tensor_split = Some("Infinity,1".into());
        assert!(validate_start_config(&config)
            .unwrap_err()
            .contains("Tensor split"));
    }
}

#[tauri::command]
pub fn stop_llama_server(state: State<'_, AppState>) -> Result<String, String> {
    let mut lock = state.child_process.lock().map_err(|e| e.to_string())?;
    if let Some(child) = lock.take() {
        child
            .kill()
            .map_err(|e| format!("Failed to kill process: {}", e))?;
        set_server_pid(&state.server_pid, None);
        if let Ok(mut endpoint) = state.managed_server_endpoint.lock() {
            *endpoint = None;
        }
        Ok("Server stopped".into())
    } else {
        Err("No server running".into())
    }
}

#[tauri::command]
pub fn get_managed_server_endpoint(
    state: State<'_, AppState>,
) -> Result<Option<(String, u16)>, String> {
    let endpoint = state
        .managed_server_endpoint
        .lock()
        .map_err(|e| e.to_string())?;
    Ok(endpoint.clone())
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
