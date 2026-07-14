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
        } else if path
            .extension()
            .and_then(|ext| ext.to_str())
            .is_some_and(|ext| ext.eq_ignore_ascii_case("gguf"))
        {
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

// Keep scoring logic in sync with suggestMmprojPath in src/utils/config.ts.
fn is_noise_token(token: &str) -> bool {
    matches!(
        token,
        "gguf"
            | "mmproj"
            | "proj"
            | "projector"
            | "vision"
            | "text"
            | "f16"
            | "f32"
            | "bf16"
            | "fp16"
            | "fp32"
    ) || {
        let lower = token.to_ascii_lowercase();
        lower.starts_with('q')
            && lower.len() > 1
            && lower.chars().nth(1).is_some_and(|c| c.is_ascii_digit())
    }
}

fn model_name_tokens(name: &str) -> Vec<String> {
    let stem = name
        .trim()
        .trim_end_matches(".gguf")
        .trim_end_matches(".GGUF")
        .to_ascii_lowercase();
    stem.split(|c: char| c == '-' || c == '_' || c == '.' || c.is_whitespace())
        .filter(|token| {
            let token = token.trim();
            token.len() >= 3 && !is_noise_token(token)
        })
        .map(|token| token.to_string())
        .collect()
}

fn score_mmproj_for_model(model_path: &Path, mmproj_filename: &str) -> i32 {
    let model_stem = model_path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or_default();
    let model_tokens = model_name_tokens(model_stem);
    let mmproj_tokens = model_name_tokens(mmproj_filename);
    if model_tokens.is_empty() || mmproj_tokens.is_empty() {
        return 0;
    }

    let model_set: HashSet<&str> = model_tokens.iter().map(String::as_str).collect();
    let mut score = 0;
    for token in &mmproj_tokens {
        if model_set.contains(token.as_str()) {
            score += if token.len() >= 4 { 3 } else { 2 };
        }
    }

    let model_compact = model_tokens.join("");
    let mmproj_compact = mmproj_tokens.join("");
    if !model_compact.is_empty()
        && !mmproj_compact.is_empty()
        && (model_compact.contains(&mmproj_compact) || mmproj_compact.contains(&model_compact))
    {
        score += 4;
    }

    score
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
                .map(|parent| {
                    let parent = fs::canonicalize(parent).unwrap_or_else(|_| parent.to_path_buf());
                    parent == model_dir
                })
                .unwrap_or(false)
        })
        .collect();

    if same_dir.is_empty() {
        return None;
    }

    let mut best: Option<&ModelInfo> = None;
    let mut best_score = 0;
    for mmproj in same_dir {
        let score = score_mmproj_for_model(model_path, &mmproj.filename);
        if score > best_score {
            best_score = score;
            best = Some(mmproj);
        }
    }

    if best_score >= 2 {
        best.map(|mmproj| mmproj.path.clone())
    } else {
        None
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

    #[test]
    fn does_not_pair_unrelated_mmproj_in_same_folder() {
        let mmprojs = vec![ModelInfo {
            path: r"C:\models\mmproj-F16.gguf".into(),
            filename: "mmproj-F16.gguf".into(),
            size_bytes: 1,
        }];
        assert_eq!(
            suggest_mmproj_for_model(r"C:\models\gemma-4-E4B-it-Q4_K_M.gguf", &mmprojs),
            None
        );
    }

    #[test]
    fn pairs_matching_gemma_mmproj() {
        let mmprojs = vec![ModelInfo {
            path: r"C:\models\mmproj-gemma-4-E4B-it-F16.gguf".into(),
            filename: "mmproj-gemma-4-E4B-it-F16.gguf".into(),
            size_bytes: 1,
        }];
        assert_eq!(
            suggest_mmproj_for_model(r"C:\models\gemma-4-E4B-it-Q4_K_M.gguf", &mmprojs),
            Some(r"C:\models\mmproj-gemma-4-E4B-it-F16.gguf".into())
        );
    }
}
