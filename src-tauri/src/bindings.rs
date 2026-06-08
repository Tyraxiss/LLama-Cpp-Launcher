//! Shared IPC types exported to TypeScript via ts-rs.
//!
//! Run `npm run generate:types` after changing these structs.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Serialize, Deserialize, Clone, TS)]
#[serde(default)]
#[ts(export_to = "../../src/generated/bindings.ts")]
pub struct AppConfig {
    pub exe_path: Option<String>,
    pub open_webui_venv_path: Option<String>,
    pub last_theme: String,
    pub model_directories: Vec<String>,
    pub last_model: Option<String>,
    pub last_port: u16,
    pub last_host: String,
    pub last_open_webui_port: u16,
    pub last_open_webui_host: String,
    pub last_ctx_size: u32,
    pub last_ngl: u32,
    pub last_temp: f32,
    pub last_threads: u32,
    pub last_batch_size: u32,
    pub last_flash_attn: bool,
    pub last_top_p: f32,
    pub last_top_k: u32,
    pub last_min_p: Option<f32>,
    pub last_repeat_penalty: f32,
    pub last_presence_penalty: Option<f32>,
    pub last_main_gpu: Option<u32>,
    pub last_tensor_split: Option<String>,
    pub last_no_mmap: Option<bool>,
    pub last_no_webui: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone, TS)]
#[ts(export_to = "../../src/generated/bindings.ts")]
pub struct ModelInfo {
    pub path: String,
    pub filename: String,
    #[ts(type = "number")]
    pub size_bytes: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export_to = "../../src/generated/bindings.ts")]
pub enum HfDownloadStatus {
    Downloading,
    Complete,
    Cancelled,
    Error,
}

#[derive(Debug, Serialize, TS)]
#[ts(export_to = "../../src/generated/bindings.ts")]
pub struct HfGgufFile {
    pub path: String,
    pub filename: String,
    #[ts(type = "number | null")]
    pub size_bytes: Option<u64>,
}

#[derive(Debug, Serialize, Clone, TS)]
#[ts(export_to = "../../src/generated/bindings.ts")]
pub struct HfDownloadProgress {
    pub repo: String,
    pub filename: String,
    pub target_path: String,
    #[ts(type = "number")]
    pub downloaded_bytes: u64,
    #[ts(type = "number | null")]
    pub total_bytes: Option<u64>,
    pub status: HfDownloadStatus,
    pub error: Option<String>,
}

#[derive(Debug, Deserialize, TS)]
#[ts(export_to = "../../src/generated/bindings.ts")]
pub struct HfDownloadConfig {
    pub repo: String,
    pub file_path: String,
    pub target_dir: String,
    pub token: Option<String>,
}

#[derive(Debug, Serialize, TS)]
#[ts(export_to = "../../src/generated/bindings.ts")]
pub struct HfPartialDownload {
    #[ts(type = "number")]
    pub downloaded_bytes: u64,
    #[ts(type = "number | null")]
    pub total_bytes: Option<u64>,
    pub part_path: String,
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[ts(export_to = "../../src/generated/bindings.ts")]
pub struct ServerStartConfig {
    pub exe_path: String,
    pub model_path: String,
    pub host: String,
    pub port: u16,
    pub ctx_size: u32,
    pub ngl: u32,
    pub temp: f32,
    pub threads: u32,
    pub batch_size: u32,
    pub flash_attn: bool,
    pub top_p: f32,
    pub top_k: u32,
    pub min_p: f32,
    pub repeat_penalty: f32,
    pub presence_penalty: f32,
    pub main_gpu: Option<u32>,
    pub tensor_split: Option<String>,
    pub no_mmap: bool,
    pub no_webui: bool,
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[ts(export_to = "../../src/generated/bindings.ts")]
pub struct OpenWebUiStartConfig {
    pub venv_path: String,
    pub host: String,
    pub port: u16,
    pub llama_host: String,
    pub llama_port: u16,
}

#[derive(Debug, Serialize, Clone, TS)]
#[ts(export_to = "../../src/generated/bindings.ts")]
pub struct SystemMemoryStats {
    #[ts(type = "number")]
    pub total_bytes: u64,
    #[ts(type = "number")]
    pub used_bytes: u64,
    #[ts(type = "number")]
    pub available_bytes: u64,
}

#[derive(Debug, Serialize, Clone, TS)]
#[ts(export_to = "../../src/generated/bindings.ts")]
pub struct GpuMemoryStats {
    pub index: u32,
    pub name: String,
    #[ts(type = "number")]
    pub total_bytes: u64,
    #[ts(type = "number")]
    pub used_bytes: u64,
    #[ts(type = "number")]
    pub free_bytes: u64,
}

#[derive(Debug, Serialize, Clone, TS)]
#[ts(export_to = "../../src/generated/bindings.ts")]
pub struct ProcessMemoryStats {
    pub pid: u32,
    #[ts(type = "number")]
    pub ram_bytes: u64,
    #[ts(type = "number | null")]
    pub gpu_bytes: Option<u64>,
}

#[derive(Debug, Serialize, Clone, TS)]
#[ts(export_to = "../../src/generated/bindings.ts")]
pub struct ModelMemoryBreakdown {
    pub device: String,
    pub total_mib: f64,
    pub free_mib: f64,
    pub self_mib: f64,
    pub model_mib: f64,
    pub context_mib: f64,
    pub compute_mib: f64,
}

#[derive(Debug, Serialize, Clone, TS)]
#[ts(export_to = "../../src/generated/bindings.ts")]
pub struct ResourceStats {
    pub system: SystemMemoryStats,
    pub gpus: Vec<GpuMemoryStats>,
    pub server_process: Option<ProcessMemoryStats>,
    pub model_breakdown: Vec<ModelMemoryBreakdown>,
    pub gpu_available: bool,
}

#[cfg(test)]
mod export_bindings {
    use super::*;

    #[test]
    fn export_typescript_bindings() {
        AppConfig::export().expect("export AppConfig");
        ModelInfo::export().expect("export ModelInfo");
        HfDownloadStatus::export().expect("export HfDownloadStatus");
        HfGgufFile::export().expect("export HfGgufFile");
        HfDownloadProgress::export().expect("export HfDownloadProgress");
        HfDownloadConfig::export().expect("export HfDownloadConfig");
        HfPartialDownload::export().expect("export HfPartialDownload");
        ServerStartConfig::export().expect("export ServerStartConfig");
        OpenWebUiStartConfig::export().expect("export OpenWebUiStartConfig");
        SystemMemoryStats::export().expect("export SystemMemoryStats");
        GpuMemoryStats::export().expect("export GpuMemoryStats");
        ProcessMemoryStats::export().expect("export ProcessMemoryStats");
        ModelMemoryBreakdown::export().expect("export ModelMemoryBreakdown");
        ResourceStats::export().expect("export ResourceStats");
    }
}
