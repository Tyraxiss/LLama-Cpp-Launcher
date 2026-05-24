#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::path::PathBuf;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::time::Duration;
use tauri::{Emitter, Manager, State};
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const MAX_LOG_LINES: usize = 200;

#[derive(Debug, Serialize, Deserialize, Clone)]
struct ModelInfo {
    path: String,
    filename: String,
    size_bytes: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(default)]
struct AppConfig {
    exe_path: Option<String>,
    open_webui_venv_path: Option<String>,
    last_theme: String,
    model_directories: Vec<String>,
    last_model: Option<String>,
    last_port: u16,
    last_host: String,
    last_open_webui_port: u16,
    last_open_webui_host: String,
    last_ctx_size: u32,
    last_ngl: u32,
    last_temp: f32,
    last_threads: u32,
    last_batch_size: u32,
    last_flash_attn: bool,
    last_top_p: f32,
    last_top_k: u32,
    last_min_p: Option<f32>,
    last_repeat_penalty: f32,
    last_presence_penalty: Option<f32>,
    last_main_gpu: Option<u32>,
    last_tensor_split: Option<String>,
    last_no_mmap: Option<bool>,
    last_no_webui: Option<bool>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            exe_path: None,
            open_webui_venv_path: default_open_webui_venv_path(),
            last_theme: "dark-teal".into(),
            model_directories: vec![],
            last_model: None,
            last_port: 8080,
            last_host: "127.0.0.1".into(),
            last_open_webui_port: 3000,
            last_open_webui_host: "127.0.0.1".into(),
            last_ctx_size: 8192,
            last_ngl: 99,
            last_temp: 0.7,
            last_threads: 0,
            last_batch_size: 512,
            last_flash_attn: false,
            last_top_p: 0.9,
            last_top_k: 40,
            last_min_p: Some(0.05),
            last_repeat_penalty: 1.1,
            last_presence_penalty: Some(0.0),
            last_main_gpu: None,
            last_tensor_split: None,
            last_no_mmap: None,
            last_no_webui: None,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct ServerStartConfig {
    exe_path: String,
    model_path: String,
    host: String,
    port: u16,
    ctx_size: u32,
    ngl: u32,
    temp: f32,
    threads: u32,
    batch_size: u32,
    flash_attn: bool,
    top_p: f32,
    top_k: u32,
    min_p: f32,
    repeat_penalty: f32,
    presence_penalty: f32,
    main_gpu: Option<u32>,
    tensor_split: Option<String>,
    no_mmap: bool,
    no_webui: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct OpenWebUiStartConfig {
    venv_path: String,
    host: String,
    port: u16,
    llama_host: String,
    llama_port: u16,
}

#[derive(Debug, Serialize)]
struct HfGgufFile {
    path: String,
    filename: String,
    size_bytes: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct HfRepoInfo {
    siblings: Vec<HfSibling>,
}

#[derive(Debug, Deserialize)]
struct HfSibling {
    rfilename: String,
    size: Option<u64>,
}

#[derive(Debug, Serialize, Clone)]
struct HfDownloadProgress {
    repo: String,
    filename: String,
    target_path: String,
    downloaded_bytes: u64,
    total_bytes: Option<u64>,
    status: String,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct HfDownloadConfig {
    repo: String,
    file_path: String,
    target_dir: String,
    token: Option<String>,
}

struct HfModelSpec {
    repo: String,
    selector: Option<String>,
}

struct AppState {
    child_process: Mutex<Option<CommandChild>>,
    open_webui_process: Mutex<Option<CommandChild>>,
    hf_download_cancel: Mutex<Option<Arc<AtomicBool>>>,
    config: Mutex<AppConfig>,
    stderr_log: Mutex<Vec<String>>,
    open_webui_log: Mutex<Vec<String>>,
}

impl Drop for AppState {
    fn drop(&mut self) {
        if let Ok(mut lock) = self.child_process.lock() {
            if let Some(child) = lock.take() {
                let _ = child.kill();
            }
        }
        if let Ok(mut lock) = self.open_webui_process.lock() {
            if let Some(child) = lock.take() {
                let _ = child.kill();
            }
        }
        if let Ok(mut cancel) = self.hf_download_cancel.lock() {
            if let Some(flag) = cancel.take() {
                flag.store(true, Ordering::Relaxed);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

fn get_config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    fs::create_dir_all(&data_dir).map_err(|e| format!("Failed to create data dir: {}", e))?;
    Ok(data_dir.join("config.json"))
}

fn load_config_from_disk(app: &tauri::AppHandle) -> AppConfig {
    match get_config_path(app) {
        Ok(path) => match fs::read_to_string(&path) {
            Ok(json) => serde_json::from_str(&json).unwrap_or_default(),
            Err(_) => AppConfig::default(),
        },
        Err(_) => AppConfig::default(),
    }
}

fn save_config_to_disk(app: &tauri::AppHandle, config: &AppConfig) -> Result<(), String> {
    let path = get_config_path(app)?;
    let json = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    fs::write(&path, json).map_err(|e| format!("Failed to write config: {}", e))
}

// ---------------------------------------------------------------------------
// Auto-detect
// ---------------------------------------------------------------------------

fn default_open_webui_venv_path() -> Option<String> {
    let common_paths: Vec<PathBuf> = if cfg!(target_os = "windows") {
        vec![PathBuf::from("C:\\llama.cpp\\.venv")]
    } else {
        let home = std::env::var("HOME").unwrap_or_default();
        vec![PathBuf::from(home).join("llama.cpp/.venv")]
    };

    common_paths
        .into_iter()
        .find(|path| open_webui_executable(path).is_file())
        .map(|path| path.to_string_lossy().to_string())
}

fn open_webui_executable(venv_path: &PathBuf) -> PathBuf {
    if cfg!(target_os = "windows") {
        venv_path.join("Scripts").join("open-webui.exe")
    } else {
        venv_path.join("bin").join("open-webui")
    }
}

#[tauri::command]
fn auto_detect_server() -> Option<String> {
    let exe_name = if cfg!(target_os = "windows") {
        "llama-server.exe"
    } else {
        "llama-server"
    };

    // Common install locations
    let common_paths: Vec<PathBuf> = if cfg!(target_os = "windows") {
        let home = std::env::var("USERPROFILE").unwrap_or_default();
        vec![
            PathBuf::from("C:\\llama.cpp\\build\\bin\\Release").join(exe_name),
            PathBuf::from("C:\\llama.cpp\\build\\bin").join(exe_name),
            PathBuf::from(&home)
                .join("llama.cpp\\build\\bin\\Release")
                .join(exe_name),
            PathBuf::from(&home)
                .join("llama.cpp\\build\\bin")
                .join(exe_name),
        ]
    } else {
        let home = std::env::var("HOME").unwrap_or_default();
        vec![
            PathBuf::from("/usr/local/bin").join(exe_name),
            PathBuf::from("/usr/bin").join(exe_name),
            PathBuf::from(&home)
                .join("llama.cpp/build/bin")
                .join(exe_name),
        ]
    };

    for path in &common_paths {
        if path.exists() {
            return Some(path.to_string_lossy().to_string());
        }
    }

    // Fall back to PATH lookup
    if let Ok(path_var) = std::env::var("PATH") {
        let sep = if cfg!(target_os = "windows") {
            ';'
        } else {
            ':'
        };
        for dir in path_var.split(sep) {
            let candidate = PathBuf::from(dir).join(exe_name);
            if candidate.exists() {
                return Some(candidate.to_string_lossy().to_string());
            }
        }
    }

    None
}

#[tauri::command]
fn auto_detect_open_webui_venv() -> Option<String> {
    default_open_webui_venv_path()
}

// ---------------------------------------------------------------------------
// Model scanning
// ---------------------------------------------------------------------------

#[tauri::command]
fn scan_models(directories: Vec<String>) -> Vec<ModelInfo> {
    let mut models = Vec::new();
    let mut seen_dirs = HashSet::new();
    let mut seen_models = HashSet::new();
    for dir in &directories {
        scan_dir_recursive(
            PathBuf::from(dir),
            &mut models,
            &mut seen_dirs,
            &mut seen_models,
        );
    }
    models.sort_by(|a, b| a.filename.to_lowercase().cmp(&b.filename.to_lowercase()));
    models
}

fn scan_dir_recursive(
    dir: PathBuf,
    models: &mut Vec<ModelInfo>,
    seen_dirs: &mut HashSet<PathBuf>,
    seen_models: &mut HashSet<PathBuf>,
) {
    let canonical_dir = match fs::canonicalize(&dir) {
        Ok(path) => path,
        Err(_) => return,
    };
    if !seen_dirs.insert(canonical_dir) {
        return;
    }

    let entries = match fs::read_dir(&dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let metadata = match fs::symlink_metadata(&path) {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };
        if metadata.file_type().is_symlink() {
            continue;
        }
        if metadata.is_dir() {
            scan_dir_recursive(path, models, seen_dirs, seen_models);
        } else if path.extension().map(|e| e == "gguf").unwrap_or(false) {
            let canonical_model = fs::canonicalize(&path).unwrap_or_else(|_| path.clone());
            if !seen_models.insert(canonical_model) {
                continue;
            }
            let size_bytes = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
            models.push(ModelInfo {
                path: path.to_string_lossy().to_string(),
                filename: path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default(),
                size_bytes,
            });
        }
    }
}

// ---------------------------------------------------------------------------
// Hugging Face downloads
// ---------------------------------------------------------------------------

fn parse_hf_model_spec(input: &str) -> Result<HfModelSpec, String> {
    let mut trimmed = input.trim().trim_matches('/').to_string();
    if let Some(rest) = trimmed.strip_prefix("https://huggingface.co/") {
        trimmed = rest.trim_matches('/').to_string();
    } else if let Some(rest) = trimmed.strip_prefix("http://huggingface.co/") {
        trimmed = rest.trim_matches('/').to_string();
    } else if let Some(rest) = trimmed.strip_prefix("hf.co/") {
        trimmed = rest.trim_matches('/').to_string();
    }

    let mut selector = None;
    if let Some((repo, hint)) = trimmed.rsplit_once(':') {
        let repo_part = repo.trim().to_string();
        let hint_part = hint.trim().trim_end_matches(".gguf").to_string();
        if !hint_part.is_empty() && !hint_part.contains('/') && !repo_part.is_empty() {
            trimmed = repo_part;
            selector = Some(hint_part);
        }
    }

    let parts: Vec<&str> = trimmed.split('/').collect();
    if parts.len() != 2
        || parts.iter().any(|part| {
            part.is_empty() || part.contains("..") || part.contains('\\') || part.contains(':')
        })
    {
        return Err(
            "Enter a Hugging Face repo like owner/model-name or owner/model-name:quant".into(),
        );
    }
    Ok(HfModelSpec {
        repo: trimmed,
        selector,
    })
}

fn validate_hf_repo(repo: &str) -> Result<String, String> {
    parse_hf_model_spec(repo).map(|spec| spec.repo)
}

fn percent_encode_path(path: &str) -> String {
    path.split('/')
        .map(|segment| {
            let mut encoded = String::new();
            for byte in segment.bytes() {
                if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
                    encoded.push(byte as char);
                } else {
                    encoded.push_str(&format!("%{:02X}", byte));
                }
            }
            encoded
        })
        .collect::<Vec<String>>()
        .join("/")
}

fn safe_filename(path: &str) -> Result<String, String> {
    let filename = PathBuf::from(path)
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .ok_or_else(|| "Selected file has no filename".to_string())?;
    if filename.is_empty()
        || filename.contains("..")
        || filename.contains('/')
        || filename.contains('\\')
        || !filename.to_lowercase().ends_with(".gguf")
    {
        return Err("Selected file is not a valid GGUF filename".into());
    }
    Ok(filename)
}

fn hf_client(token: Option<&str>) -> Result<reqwest::Client, String> {
    let mut headers = reqwest::header::HeaderMap::new();
    if let Some(token) = token {
        let token = token.trim();
        if !token.is_empty() {
            let value = format!("Bearer {}", token)
                .parse()
                .map_err(|_| "Invalid Hugging Face token".to_string())?;
            headers.insert(reqwest::header::AUTHORIZATION, value);
        }
    }

    reqwest::Client::builder()
        .user_agent("LLama C++ Launcher/1.0")
        .default_headers(headers)
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))
}

#[tauri::command]
async fn list_hf_gguf_files(
    repo: String,
    token: Option<String>,
) -> Result<Vec<HfGgufFile>, String> {
    let spec = parse_hf_model_spec(&repo)?;
    let repo = spec.repo;
    let url = format!("https://huggingface.co/api/models/{}", repo);
    let client = hf_client(token.as_deref())?;
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Failed to contact Hugging Face: {}", e))?;

    if response.status() == reqwest::StatusCode::UNAUTHORIZED
        || response.status() == reqwest::StatusCode::FORBIDDEN
    {
        return Err("Hugging Face denied access. Add a token for gated or private models.".into());
    }
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Err("Hugging Face repo was not found.".into());
    }
    let response = response
        .error_for_status()
        .map_err(|e| format!("Hugging Face request failed: {}", e))?;
    let repo_info: HfRepoInfo = response
        .json()
        .await
        .map_err(|e| format!("Failed to read Hugging Face response: {}", e))?;

    let mut files: Vec<HfGgufFile> = repo_info
        .siblings
        .into_iter()
        .filter(|file| file.rfilename.to_lowercase().ends_with(".gguf"))
        .map(|file| HfGgufFile {
            filename: file
                .rfilename
                .split('/')
                .last()
                .unwrap_or(&file.rfilename)
                .to_string(),
            path: file.rfilename,
            size_bytes: file.size,
        })
        .collect();
    if let Some(selector) = spec.selector {
        let selector = selector.to_lowercase();
        files.sort_by(|a, b| {
            let a_match = a.filename.to_lowercase().contains(&selector);
            let b_match = b.filename.to_lowercase().contains(&selector);
            b_match
                .cmp(&a_match)
                .then_with(|| a.filename.to_lowercase().cmp(&b.filename.to_lowercase()))
        });
    } else {
        files.sort_by(|a, b| a.filename.to_lowercase().cmp(&b.filename.to_lowercase()));
    }
    if files.is_empty() {
        return Err("No GGUF files were found in that repo.".into());
    }
    Ok(files)
}

#[tauri::command]
async fn download_hf_model(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    config: HfDownloadConfig,
) -> Result<String, String> {
    let repo = validate_hf_repo(&config.repo)?;
    let filename = safe_filename(&config.file_path)?;
    let target_dir = PathBuf::from(&config.target_dir);
    if !target_dir.is_dir() {
        return Err("Target model folder was not found.".into());
    }

    let target_path = target_dir.join(&filename);
    if target_path.exists() {
        return Err("That model file already exists in the target folder.".into());
    }
    let part_path = target_dir.join(format!("{}.part", filename));
    if part_path.exists() {
        fs::remove_file(&part_path)
            .map_err(|e| format!("Failed to remove previous partial download: {}", e))?;
    }

    let cancel_flag = Arc::new(AtomicBool::new(false));
    {
        let mut lock = state.hf_download_cancel.lock().map_err(|e| e.to_string())?;
        if lock.is_some() {
            return Err("A Hugging Face download is already running.".into());
        }
        *lock = Some(cancel_flag.clone());
    }

    let result: Result<String, String> = async {
        let file_url = format!(
            "https://huggingface.co/{}/resolve/main/{}?download=true",
            repo,
            percent_encode_path(&config.file_path)
        );
        let client = hf_client(config.token.as_deref())?;
        let mut response = client
            .get(file_url)
            .send()
            .await
            .map_err(|e| format!("Failed to start download: {}", e))?;

        if response.status() == reqwest::StatusCode::UNAUTHORIZED
            || response.status() == reqwest::StatusCode::FORBIDDEN
        {
            return Err(
                "Hugging Face denied access. Add a token for gated or private models.".into(),
            );
        }
        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Err("Selected GGUF file was not found.".into());
        }
        response = response
            .error_for_status()
            .map_err(|e| format!("Download failed: {}", e))?;

        let total_bytes = response.content_length();
        let target_string = target_path.to_string_lossy().to_string();
        let mut file = fs::File::create(&part_path)
            .map_err(|e| format!("Failed to create download file: {}", e))?;
        let mut downloaded_bytes = 0_u64;

        let _ = app_handle.emit(
            "hf-download-progress",
            HfDownloadProgress {
                repo: repo.clone(),
                filename: filename.clone(),
                target_path: target_string.clone(),
                downloaded_bytes,
                total_bytes,
                status: "downloading".into(),
                error: None,
            },
        );

        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|e| format!("Failed while downloading: {}", e))?
        {
            if cancel_flag.load(Ordering::Relaxed) {
                drop(file);
                let _ = fs::remove_file(&part_path);
                let _ = app_handle.emit(
                    "hf-download-progress",
                    HfDownloadProgress {
                        repo: repo.clone(),
                        filename: filename.clone(),
                        target_path: target_string.clone(),
                        downloaded_bytes,
                        total_bytes,
                        status: "cancelled".into(),
                        error: None,
                    },
                );
                return Err("Download cancelled".into());
            }

            file.write_all(&chunk)
                .map_err(|e| format!("Failed to write download: {}", e))?;
            downloaded_bytes += chunk.len() as u64;
            let _ = app_handle.emit(
                "hf-download-progress",
                HfDownloadProgress {
                    repo: repo.clone(),
                    filename: filename.clone(),
                    target_path: target_string.clone(),
                    downloaded_bytes,
                    total_bytes,
                    status: "downloading".into(),
                    error: None,
                },
            );
        }

        file.flush()
            .map_err(|e| format!("Failed to finish writing download: {}", e))?;
        drop(file);
        fs::rename(&part_path, &target_path)
            .map_err(|e| format!("Failed to finalize download: {}", e))?;
        let _ = app_handle.emit(
            "hf-download-progress",
            HfDownloadProgress {
                repo: repo.clone(),
                filename: filename.clone(),
                target_path: target_string.clone(),
                downloaded_bytes,
                total_bytes,
                status: "complete".into(),
                error: None,
            },
        );

        Ok(target_string)
    }
    .await;

    if let Ok(mut lock) = state.hf_download_cancel.lock() {
        let _ = lock.take();
    }

    if let Err(ref error) = result {
        let _ = app_handle.emit(
            "hf-download-progress",
            HfDownloadProgress {
                repo,
                filename,
                target_path: target_path.to_string_lossy().to_string(),
                downloaded_bytes: 0,
                total_bytes: None,
                status: "error".into(),
                error: Some(error.clone()),
            },
        );
    }

    result
}

#[tauri::command]
fn cancel_hf_download(state: State<'_, AppState>) -> Result<String, String> {
    let lock = state.hf_download_cancel.lock().map_err(|e| e.to_string())?;
    if let Some(flag) = lock.as_ref() {
        flag.store(true, Ordering::Relaxed);
        Ok("Download cancellation requested".into())
    } else {
        Err("No Hugging Face download is running".into())
    }
}

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

#[tauri::command]
async fn start_llama_server(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    config: ServerStartConfig,
) -> Result<String, String> {
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

    let shell = app_handle.shell();
    let (rx, child) = shell
        .command(&config.exe_path)
        .args(&args)
        .spawn()
        .map_err(|e| format!("Failed to launch server: {}", e))?;

    // Background task: capture stderr and emit to frontend
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
                    if let Ok(mut child) = state.child_process.lock() {
                        let _ = child.take();
                    }
                }
                let _ = app_clone.emit("server-exited", format!("{:?}", payload));
                break;
            }
        }
    });

    *lock = Some(child);
    Ok(format!("Server started on {}:{}", config.host, config.port))
}

#[tauri::command]
fn stop_llama_server(state: State<'_, AppState>) -> Result<String, String> {
    let mut lock = state.child_process.lock().map_err(|e| e.to_string())?;
    if let Some(child) = lock.take() {
        child
            .kill()
            .map_err(|e| format!("Failed to kill process: {}", e))?;
        Ok("Server stopped".into())
    } else {
        Err("No server running".into())
    }
}

#[tauri::command]
fn get_server_log(state: State<'_, AppState>) -> Vec<String> {
    state
        .stderr_log
        .lock()
        .map(|log| log.clone())
        .unwrap_or_default()
}

#[tauri::command]
fn clear_server_log(state: State<'_, AppState>) {
    if let Ok(mut log) = state.stderr_log.lock() {
        log.clear();
    }
}

#[tauri::command]
async fn start_open_webui(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    config: OpenWebUiStartConfig,
) -> Result<String, String> {
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
                    if let Ok(mut child) = state.open_webui_process.lock() {
                        let _ = child.take();
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
fn stop_open_webui(state: State<'_, AppState>) -> Result<String, String> {
    let mut lock = state.open_webui_process.lock().map_err(|e| e.to_string())?;
    if let Some(child) = lock.take() {
        child
            .kill()
            .map_err(|e| format!("Failed to kill Open WebUI process: {}", e))?;
        Ok("Open WebUI stopped".into())
    } else {
        Err("Open WebUI is not running".into())
    }
}

#[tauri::command]
fn get_open_webui_log(state: State<'_, AppState>) -> Vec<String> {
    state
        .open_webui_log
        .lock()
        .map(|log| log.clone())
        .unwrap_or_default()
}

#[tauri::command]
fn clear_open_webui_log(state: State<'_, AppState>) {
    if let Ok(mut log) = state.open_webui_log.lock() {
        log.clear();
    }
}

#[tauri::command]
fn check_open_webui_health(host: String, port: u16) -> Result<String, String> {
    let socket_addr = (host.as_str(), port)
        .to_socket_addrs()
        .map_err(|_| "Invalid address".to_string())?
        .next()
        .ok_or_else(|| "Invalid address".to_string())?;

    match TcpStream::connect_timeout(&socket_addr, Duration::from_secs(2)) {
        Ok(_) => Ok("running".into()),
        Err(_) => Err("not reachable".into()),
    }
}

#[tauri::command]
fn check_server_health(host: String, port: u16) -> Result<String, String> {
    let addr = format!("{}:{}", host, port);
    let socket_addr = (host.as_str(), port)
        .to_socket_addrs()
        .map_err(|_| "Invalid address".to_string())?
        .next()
        .ok_or_else(|| "Invalid address".to_string())?;

    match TcpStream::connect_timeout(&socket_addr, Duration::from_secs(2)) {
        Ok(mut stream) => {
            let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
            // Try to read from health endpoint
            let request = format!(
                "GET /health HTTP/1.0\r\nHost: {}\r\nConnection: close\r\n\r\n",
                addr
            );
            let _ = stream.write_all(request.as_bytes());
            let mut response = String::new();
            let _ = stream.read_to_string(&mut response);
            if response.contains("ok") || response.contains("200") {
                Ok("healthy".into())
            } else {
                Ok("running".into())
            }
        }
        Err(_) => Err("not reachable".into()),
    }
}

// ---------------------------------------------------------------------------
// Config persistence
// ---------------------------------------------------------------------------

#[tauri::command]
fn load_config(app: tauri::AppHandle, state: State<'_, AppState>) -> AppConfig {
    let config = load_config_from_disk(&app);
    if let Ok(mut stored) = state.config.lock() {
        *stored = config.clone();
    }
    config
}

#[tauri::command]
fn save_config(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    config: AppConfig,
) -> Result<(), String> {
    save_config_to_disk(&app, &config)?;
    if let Ok(mut stored) = state.config.lock() {
        *stored = config;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let config = load_config_from_disk(&app.handle());
            app.manage(AppState {
                child_process: Mutex::new(None),
                open_webui_process: Mutex::new(None),
                hf_download_cancel: Mutex::new(None),
                config: Mutex::new(config),
                stderr_log: Mutex::new(Vec::new()),
                open_webui_log: Mutex::new(Vec::new()),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            auto_detect_server,
            auto_detect_open_webui_venv,
            scan_models,
            list_hf_gguf_files,
            download_hf_model,
            cancel_hf_download,
            start_llama_server,
            stop_llama_server,
            start_open_webui,
            stop_open_webui,
            check_server_health,
            check_open_webui_health,
            get_server_log,
            clear_server_log,
            get_open_webui_log,
            clear_open_webui_log,
            load_config,
            save_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
