use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

pub use crate::bindings::{ModelInfo, ModelScanResult};

pub fn is_mmproj_filename(filename: &str) -> bool {
    filename.to_ascii_lowercase().contains("mmproj")
}

pub fn scan_models_sync(directories: Vec<String>) -> ModelScanResult {
    let mut all = Vec::new();
    let mut seen_dirs = HashSet::new();
    let mut seen_models = HashSet::new();
    for dir in &directories {
        scan_dir_recursive(
            PathBuf::from(dir),
            &mut all,
            &mut seen_dirs,
            &mut seen_models,
        );
    }

    let mut models = Vec::new();
    let mut mmprojs = Vec::new();
    for model in all {
        if is_mmproj_filename(&model.filename) {
            mmprojs.push(model);
        } else {
            models.push(model);
        }
    }

    models.sort_by_key(|model| model.filename.to_lowercase());
    mmprojs.sort_by_key(|model| model.filename.to_lowercase());

    ModelScanResult { models, mmprojs }
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

pub fn suggest_mmproj_for_model(model_path: &str, mmprojs: &[ModelInfo]) -> Option<String> {
    let model_path = Path::new(model_path);
    let model_dir = model_path.parent()?;
    let model_dir = fs::canonicalize(model_dir).unwrap_or_else(|_| model_dir.to_path_buf());

    let same_dir: Vec<&ModelInfo> = mmprojs
        .iter()
        .filter(|mmproj| {
            Path::new(&mmproj.path)
                .parent()
                .and_then(|parent| fs::canonicalize(parent).ok())
                .map(|parent| parent == model_dir)
                .unwrap_or(false)
        })
        .collect();

    match same_dir.len() {
        0 => None,
        1 => Some(same_dir[0].path.clone()),
        _ => {
            let model_stem = model_path
                .file_stem()
                .and_then(|stem| stem.to_str())
                .unwrap_or_default()
                .to_ascii_lowercase();

            let mut best = same_dir[0];
            let mut best_score = 0_i32;
            for mmproj in &same_dir {
                let filename = mmproj.filename.to_ascii_lowercase();
                let mut score = 0;
                if filename.contains(&model_stem) {
                    score += 10;
                }
                let stripped = filename.replace("mmproj", "").replace(['-', '_', '.'], "");
                let model_compact = model_stem.replace(['-', '_', '.'], "");
                if !model_compact.is_empty()
                    && (stripped.contains(&model_compact) || model_compact.contains(&stripped))
                {
                    score += 5;
                }
                if score > best_score {
                    best_score = score;
                    best = mmproj;
                }
            }
            Some(best.path.clone())
        }
    }
}

#[tauri::command]
pub async fn scan_models(directories: Vec<String>) -> Result<ModelScanResult, String> {
    tauri::async_runtime::spawn_blocking(move || scan_models_sync(directories))
        .await
        .map_err(|e| format!("Model scan failed: {}", e))
}

#[tauri::command]
pub fn suggest_mmproj(model_path: String, mmprojs: Vec<ModelInfo>) -> Option<String> {
    suggest_mmproj_for_model(&model_path, &mmprojs)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_mmproj_filenames() {
        assert!(is_mmproj_filename("mmproj-model-f16.gguf"));
        assert!(is_mmproj_filename("llava-mmproj.Q4_K_M.gguf"));
        assert!(!is_mmproj_filename("model-Q4_K_M.gguf"));
    }
}
