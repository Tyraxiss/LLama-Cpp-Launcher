#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod bindings;
mod config;
mod gguf;
mod health;
mod hf;
mod llama_update;
mod models;
mod open_webui;
mod process_util;
mod resources;
mod server;
mod state;

use config::load_config_from_disk;
use state::AppState;
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let config = load_config_from_disk(app.handle());
            app.manage(AppState {
                child_process: std::sync::Mutex::new(None),
                server_pid: std::sync::Mutex::new(None),
                open_webui_process: std::sync::Mutex::new(None),
                open_webui_updating: std::sync::Mutex::new(false),
                llama_cpp_updating: std::sync::Mutex::new(false),
                hf_download_cancel: std::sync::Mutex::new(None),
                config: std::sync::Mutex::new(config),
                stderr_log: std::sync::Mutex::new(Vec::new()),
                open_webui_log: std::sync::Mutex::new(Vec::new()),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            config::auto_detect_server,
            config::auto_detect_open_webui_venv,
            config::load_config,
            config::save_config,
            models::scan_models,
            models::suggest_mmproj,
            hf::list_hf_gguf_files,
            hf::get_hf_partial_download,
            hf::discard_hf_partial_download,
            hf::download_hf_model,
            hf::cancel_hf_download,
            server::start_llama_server,
            server::stop_llama_server,
            server::get_server_log,
            server::clear_server_log,
            open_webui::get_open_webui_version,
            open_webui::get_open_webui_latest_version,
            open_webui::update_open_webui,
            open_webui::start_open_webui,
            open_webui::stop_open_webui,
            open_webui::get_open_webui_log,
            open_webui::clear_open_webui_log,
            health::check_server_health,
            health::check_open_webui_health,
            resources::get_resource_stats,
            llama_update::get_llama_cpp_update_info,
            llama_update::update_llama_cpp,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
