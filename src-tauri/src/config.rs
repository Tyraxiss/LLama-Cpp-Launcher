use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

pub use crate::bindings::AppConfig;

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            exe_path: None,
            open_webui_venv_path: default_open_webui_venv_path(),
            last_theme: "dark-teal".into(),
            model_directories: vec![],
            last_model: None,
            last_mmproj: None,
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
            llama_cpp_backend: None,
            llama_cpp_tag: None,
        }
    }
}

pub fn get_config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    fs::create_dir_all(&data_dir).map_err(|e| format!("Failed to create data dir: {}", e))?;
    Ok(data_dir.join("config.json"))
}

pub fn load_config_from_disk(app: &tauri::AppHandle) -> AppConfig {
    match get_config_path(app) {
        Ok(path) => match fs::read_to_string(&path) {
            Ok(json) => serde_json::from_str(&json).unwrap_or_default(),
            Err(_) => AppConfig::default(),
        },
        Err(_) => AppConfig::default(),
    }
}

pub fn save_config_to_disk(app: &tauri::AppHandle, config: &AppConfig) -> Result<(), String> {
    let path = get_config_path(app)?;
    let json = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    fs::write(&path, json).map_err(|e| format!("Failed to write config: {}", e))
}

pub fn default_open_webui_venv_path() -> Option<String> {
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

pub fn open_webui_executable(venv_path: &Path) -> PathBuf {
    if cfg!(target_os = "windows") {
        venv_path.join("Scripts").join("open-webui.exe")
    } else {
        venv_path.join("bin").join("open-webui")
    }
}

pub fn open_webui_python(venv_path: &Path) -> PathBuf {
    if cfg!(target_os = "windows") {
        venv_path.join("Scripts").join("python.exe")
    } else {
        venv_path.join("bin").join("python")
    }
}

#[tauri::command]
pub fn auto_detect_server() -> Option<String> {
    let exe_name = if cfg!(target_os = "windows") {
        "llama-server.exe"
    } else {
        "llama-server"
    };

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
pub fn auto_detect_open_webui_venv() -> Option<String> {
    default_open_webui_venv_path()
}

#[tauri::command]
pub fn load_config(
    app: tauri::AppHandle,
    state: tauri::State<'_, crate::state::AppState>,
) -> AppConfig {
    let config = load_config_from_disk(&app);
    if let Ok(mut stored) = state.config.lock() {
        *stored = config.clone();
    }
    config
}

#[tauri::command]
pub fn save_config(
    app: tauri::AppHandle,
    state: tauri::State<'_, crate::state::AppState>,
    config: AppConfig,
) -> Result<(), String> {
    save_config_to_disk(&app, &config)?;
    if let Ok(mut stored) = state.config.lock() {
        *stored = config;
    }
    Ok(())
}
