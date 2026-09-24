use std::sync::Mutex;
use tauri_plugin_shell::process::CommandChild;
use tokio::sync::watch;

use crate::config::AppConfig;

pub const MAX_LOG_LINES: usize = 200;

pub struct AppState {
    pub child_process: Mutex<Option<CommandChild>>,
    pub server_pid: Mutex<Option<u32>>,
    pub managed_server_endpoint: Mutex<Option<(String, u16)>>,
    pub open_webui_process: Mutex<Option<CommandChild>>,
    pub open_webui_venv_path: Mutex<Option<String>>,
    pub open_webui_process_venv_path: Mutex<Option<String>>,
    pub open_webui_updating: Mutex<bool>,
    pub llama_cpp_updating: Mutex<bool>,
    pub hf_download_cancel: Mutex<Option<watch::Sender<bool>>>,
    pub config: Mutex<AppConfig>,
    pub stderr_log: Mutex<Vec<String>>,
    pub open_webui_log: Mutex<Vec<String>>,
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
            if let Some(sender) = cancel.take() {
                let _ = sender.send(true);
            }
        }
    }
}
