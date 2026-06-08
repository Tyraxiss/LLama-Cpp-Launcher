use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;

pub use crate::bindings::ModelInfo;

pub fn scan_models_sync(directories: Vec<String>) -> Vec<ModelInfo> {
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
    models.sort_by_key(|model| model.filename.to_lowercase());
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

#[tauri::command]
pub async fn scan_models(directories: Vec<String>) -> Result<Vec<ModelInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || scan_models_sync(directories))
        .await
        .map_err(|e| format!("Model scan failed: {}", e))
}
