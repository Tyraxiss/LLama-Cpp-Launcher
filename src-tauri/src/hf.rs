use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::{Duration, Instant};
use tauri::{Emitter, State};

use crate::state::AppState;

use crate::bindings::{
    HfDownloadConfig, HfDownloadProgress, HfDownloadStatus, HfGgufFile, HfPartialDownload,
};

#[derive(Debug, Deserialize)]
struct HfRepoInfo {
    sha: String,
    siblings: Vec<HfSibling>,
}

#[derive(Debug, Deserialize)]
struct HfSibling {
    rfilename: String,
    size: Option<u64>,
    lfs: Option<HfLfsInfo>,
}

#[derive(Debug, Deserialize)]
struct HfLfsInfo {
    size: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
struct HfPartialMetadata {
    repo: String,
    file_path: String,
    revision: String,
    total_bytes: Option<u64>,
}

pub struct HfModelSpec {
    repo: String,
    selector: Option<String>,
}

pub fn parse_hf_model_spec(input: &str) -> Result<HfModelSpec, String> {
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

pub fn percent_encode_path(path: &str) -> String {
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

pub fn safe_filename(path: &str) -> Result<String, String> {
    let trimmed = path.trim();
    if trimmed.is_empty()
        || trimmed.contains("..")
        || trimmed.starts_with('/')
        || trimmed.starts_with('\\')
    {
        return Err("Selected file is not a valid GGUF filename".into());
    }

    let filename = PathBuf::from(trimmed)
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

async fn fetch_hf_repo_info(repo: &str, token: Option<&str>) -> Result<HfRepoInfo, String> {
    let url = format!("https://huggingface.co/api/models/{}?blobs=true", repo);
    let client = hf_client(token)?;
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
    response
        .error_for_status()
        .map_err(|e| format!("Hugging Face request failed: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Failed to read Hugging Face response: {}", e))
}

fn gguf_files_from_repo(repo_info: HfRepoInfo, selector: Option<String>) -> Vec<HfGgufFile> {
    let mut files: Vec<HfGgufFile> = repo_info
        .siblings
        .into_iter()
        .filter(|file| file.rfilename.to_lowercase().ends_with(".gguf"))
        .map(|file| HfGgufFile {
            filename: file
                .rfilename
                .rsplit('/')
                .next_back()
                .unwrap_or(&file.rfilename)
                .to_string(),
            path: file.rfilename,
            size_bytes: file.size.or_else(|| file.lfs.and_then(|lfs| lfs.size)),
        })
        .collect();

    if let Some(selector) = selector {
        let selector = selector.to_lowercase();
        files.sort_by(|a, b| {
            let a_match = a.filename.to_lowercase().contains(&selector);
            let b_match = b.filename.to_lowercase().contains(&selector);
            b_match
                .cmp(&a_match)
                .then_with(|| a.filename.to_lowercase().cmp(&b.filename.to_lowercase()))
        });
    } else {
        files.sort_by_key(|file| file.filename.to_lowercase());
    }

    files
}

#[tauri::command]
pub async fn list_hf_gguf_files(
    repo: String,
    token: Option<String>,
) -> Result<Vec<HfGgufFile>, String> {
    let spec = parse_hf_model_spec(&repo)?;
    let repo_info = fetch_hf_repo_info(&spec.repo, token.as_deref()).await?;
    let files = gguf_files_from_repo(repo_info, spec.selector);
    if files.is_empty() {
        return Err("No GGUF files were found in that repo.".into());
    }
    Ok(files)
}

fn emit_download_progress(
    app_handle: &tauri::AppHandle,
    progress: HfDownloadProgress,
    last_emit: &mut Instant,
    force: bool,
) {
    if force || last_emit.elapsed() >= Duration::from_millis(250) {
        let _ = app_handle.emit("hf-download-progress", progress);
        *last_emit = Instant::now();
    }
}

fn part_meta_path(part_path: &Path) -> PathBuf {
    PathBuf::from(format!("{}.meta.json", part_path.to_string_lossy()))
}

fn read_partial_metadata(part_path: &Path) -> Option<HfPartialMetadata> {
    let json = fs::read_to_string(part_meta_path(part_path)).ok()?;
    serde_json::from_str(&json).ok()
}

fn write_partial_metadata(part_path: &Path, metadata: &HfPartialMetadata) -> Result<(), String> {
    let json = serde_json::to_string_pretty(metadata)
        .map_err(|e| format!("Failed to serialize download metadata: {}", e))?;
    fs::write(part_meta_path(part_path), json)
        .map_err(|e| format!("Failed to write download metadata: {}", e))
}

fn remove_partial_artifacts(part_path: &Path) {
    let _ = fs::remove_file(part_path);
    let _ = fs::remove_file(part_meta_path(part_path));
}

fn metadata_matches(meta: &HfPartialMetadata, repo: &str, file_path: &str, revision: &str) -> bool {
    meta.repo == repo && meta.file_path == file_path && meta.revision == revision
}

fn parse_content_range_total(headers: &reqwest::header::HeaderMap) -> Option<u64> {
    let value = headers.get(reqwest::header::CONTENT_RANGE)?.to_str().ok()?;
    let total = value.rsplit('/').next()?;
    if total == "*" {
        return None;
    }
    total.parse().ok()
}

fn part_file_size(part_path: &Path) -> u64 {
    fs::metadata(part_path).map(|meta| meta.len()).unwrap_or(0)
}

fn prepare_partial_download(part_path: &Path, repo: &str, file_path: &str, revision: &str) -> u64 {
    if !part_path.exists() {
        return 0;
    }

    let resume_from = part_file_size(part_path);
    if resume_from == 0 {
        remove_partial_artifacts(part_path);
        return 0;
    }

    match read_partial_metadata(part_path) {
        Some(meta) if metadata_matches(&meta, repo, file_path, revision) => resume_from,
        _ => {
            remove_partial_artifacts(part_path);
            0
        }
    }
}

fn finalize_download(part_path: &Path, target_path: &Path) -> Result<(), String> {
    fs::rename(part_path, target_path)
        .map_err(|e| format!("Failed to finalize download: {}", e))?;
    let _ = fs::remove_file(part_meta_path(part_path));
    Ok(())
}

#[tauri::command]
pub async fn get_hf_partial_download(
    repo: String,
    file_path: String,
    target_dir: String,
    token: Option<String>,
) -> Result<Option<HfPartialDownload>, String> {
    let repo = validate_hf_repo(&repo)?;
    let filename = safe_filename(&file_path)?;
    let target_dir = PathBuf::from(&target_dir);
    if !target_dir.is_dir() {
        return Ok(None);
    }

    let part_path = target_dir.join(format!("{}.part", filename));
    if !part_path.exists() {
        return Ok(None);
    }

    let downloaded_bytes = part_file_size(&part_path);
    if downloaded_bytes == 0 {
        remove_partial_artifacts(&part_path);
        return Ok(None);
    }

    let repo_info = fetch_hf_repo_info(&repo, token.as_deref()).await?;
    let meta = match read_partial_metadata(&part_path) {
        Some(meta) if metadata_matches(&meta, &repo, &file_path, &repo_info.sha) => meta,
        _ => return Ok(None),
    };

    Ok(Some(HfPartialDownload {
        downloaded_bytes,
        total_bytes: meta.total_bytes,
        part_path: part_path.to_string_lossy().to_string(),
    }))
}

#[tauri::command]
pub fn discard_hf_partial_download(target_dir: String, file_path: String) -> Result<(), String> {
    let filename = safe_filename(&file_path)?;
    let part_path = PathBuf::from(&target_dir).join(format!("{}.part", filename));
    if part_path.exists() {
        remove_partial_artifacts(&part_path);
    }
    Ok(())
}

#[tauri::command]
pub async fn download_hf_model(
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

    let repo_info = fetch_hf_repo_info(&repo, config.token.as_deref()).await?;
    let revision = repo_info.sha;
    let resume_from = prepare_partial_download(&part_path, &repo, &config.file_path, &revision);

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
            "https://huggingface.co/{}/resolve/{}/{}?download=true",
            repo,
            revision,
            percent_encode_path(&config.file_path)
        );
        let client = hf_client(config.token.as_deref())?;
        let target_string = target_path.to_string_lossy().to_string();

        let existing_meta = read_partial_metadata(&part_path);
        let mut metadata = HfPartialMetadata {
            repo: repo.clone(),
            file_path: config.file_path.clone(),
            revision: revision.clone(),
            total_bytes: existing_meta.and_then(|meta| meta.total_bytes),
        };

        if resume_from > 0 {
            if let Some(total_bytes) = metadata.total_bytes {
                if resume_from >= total_bytes {
                    finalize_download(&part_path, &target_path)?;
                    emit_download_progress(
                        &app_handle,
                        HfDownloadProgress {
                            repo: repo.clone(),
                            filename: filename.clone(),
                            target_path: target_string.clone(),
                            downloaded_bytes: total_bytes,
                            total_bytes: Some(total_bytes),
                            status: HfDownloadStatus::Complete,
                            error: None,
                        },
                        &mut Instant::now(),
                        true,
                    );
                    return Ok(target_string);
                }
            }
        } else {
            write_partial_metadata(&part_path, &metadata)?;
        }

        let mut request = client.get(&file_url);
        if resume_from > 0 {
            request = request.header(reqwest::header::RANGE, format!("bytes={}-", resume_from));
        }

        let response = request
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

        let status = response.status();
        let mut response = if status.is_success() {
            response
        } else {
            return Err(format!("Download failed: HTTP {}", status.as_u16()));
        };

        let mut downloaded_bytes = resume_from;
        let mut total_bytes = parse_content_range_total(response.headers())
            .or(metadata.total_bytes)
            .or_else(|| {
                if resume_from == 0 {
                    response.content_length()
                } else {
                    None
                }
            });

        let mut file = if status == reqwest::StatusCode::PARTIAL_CONTENT {
            OpenOptions::new()
                .create(true)
                .append(true)
                .open(&part_path)
                .map_err(|e| format!("Failed to open download file: {}", e))?
        } else if resume_from > 0 {
            downloaded_bytes = 0;
            metadata.total_bytes = response.content_length();
            total_bytes = metadata.total_bytes;
            write_partial_metadata(&part_path, &metadata)?;
            fs::File::create(&part_path)
                .map_err(|e| format!("Failed to recreate download file: {}", e))?
        } else {
            metadata.total_bytes = total_bytes;
            write_partial_metadata(&part_path, &metadata)?;
            fs::File::create(&part_path)
                .map_err(|e| format!("Failed to create download file: {}", e))?
        };

        if total_bytes.is_none() {
            metadata.total_bytes = None;
        } else {
            metadata.total_bytes = total_bytes;
            write_partial_metadata(&part_path, &metadata)?;
        }

        let mut last_emit = Instant::now();
        emit_download_progress(
            &app_handle,
            HfDownloadProgress {
                repo: repo.clone(),
                filename: filename.clone(),
                target_path: target_string.clone(),
                downloaded_bytes,
                total_bytes,
                status: HfDownloadStatus::Downloading,
                error: None,
            },
            &mut last_emit,
            true,
        );

        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|e| format!("Failed while downloading: {}", e))?
        {
            if cancel_flag.load(Ordering::Relaxed) {
                drop(file);
                write_partial_metadata(&part_path, &metadata)?;
                emit_download_progress(
                    &app_handle,
                    HfDownloadProgress {
                        repo: repo.clone(),
                        filename: filename.clone(),
                        target_path: target_string.clone(),
                        downloaded_bytes,
                        total_bytes,
                        status: HfDownloadStatus::Cancelled,
                        error: None,
                    },
                    &mut last_emit,
                    true,
                );
                return Err("Download cancelled".into());
            }

            file.write_all(&chunk)
                .map_err(|e| format!("Failed to write download: {}", e))?;
            downloaded_bytes += chunk.len() as u64;
            emit_download_progress(
                &app_handle,
                HfDownloadProgress {
                    repo: repo.clone(),
                    filename: filename.clone(),
                    target_path: target_string.clone(),
                    downloaded_bytes,
                    total_bytes,
                    status: HfDownloadStatus::Downloading,
                    error: None,
                },
                &mut last_emit,
                false,
            );
        }

        file.flush()
            .map_err(|e| format!("Failed to finish writing download: {}", e))?;
        drop(file);
        finalize_download(&part_path, &target_path)?;
        emit_download_progress(
            &app_handle,
            HfDownloadProgress {
                repo: repo.clone(),
                filename: filename.clone(),
                target_path: target_string.clone(),
                downloaded_bytes,
                total_bytes,
                status: HfDownloadStatus::Complete,
                error: None,
            },
            &mut last_emit,
            true,
        );

        Ok(target_string)
    }
    .await;

    if let Ok(mut lock) = state.hf_download_cancel.lock() {
        let _ = lock.take();
    }

    if let Err(ref error) = result {
        let downloaded_bytes = part_file_size(&part_path);
        let total_bytes = read_partial_metadata(&part_path).and_then(|meta| meta.total_bytes);
        if error != "Download cancelled" {
            let _ = app_handle.emit(
                "hf-download-progress",
                HfDownloadProgress {
                    repo,
                    filename,
                    target_path: target_path.to_string_lossy().to_string(),
                    downloaded_bytes,
                    total_bytes,
                    status: HfDownloadStatus::Error,
                    error: Some(error.clone()),
                },
            );
        }
    }

    result
}

#[tauri::command]
pub fn cancel_hf_download(state: State<'_, AppState>) -> Result<String, String> {
    let lock = state.hf_download_cancel.lock().map_err(|e| e.to_string())?;
    if let Some(flag) = lock.as_ref() {
        flag.store(true, Ordering::Relaxed);
        Ok("Download cancellation requested".into())
    } else {
        Err("No Hugging Face download is running".into())
    }
}

#[cfg(test)]
mod tests {
    use super::{
        metadata_matches, parse_hf_model_spec, part_meta_path, percent_encode_path, safe_filename,
        HfPartialMetadata,
    };
    use std::path::PathBuf;

    #[test]
    fn parse_simple_repo() {
        let spec = parse_hf_model_spec("owner/model-GGUF").unwrap();
        assert_eq!(spec.repo, "owner/model-GGUF");
        assert!(spec.selector.is_none());
    }

    #[test]
    fn parse_repo_with_quant_selector() {
        let spec = parse_hf_model_spec("bartowski/Qwen2.5-Coder-7B-Instruct-GGUF:Q4_K_M").unwrap();
        assert_eq!(spec.repo, "bartowski/Qwen2.5-Coder-7B-Instruct-GGUF");
        assert_eq!(spec.selector.as_deref(), Some("Q4_K_M"));
    }

    #[test]
    fn parse_hf_url() {
        let spec = parse_hf_model_spec(
            "https://huggingface.co/unsloth/gemma-4-26B-A4B-it-GGUF:UD-Q2_K_XL",
        )
        .unwrap();
        assert_eq!(spec.repo, "unsloth/gemma-4-26B-A4B-it-GGUF");
        assert_eq!(spec.selector.as_deref(), Some("UD-Q2_K_XL"));
    }

    #[test]
    fn reject_invalid_repo() {
        assert!(parse_hf_model_spec("not-a-repo").is_err());
        assert!(parse_hf_model_spec("owner/../evil").is_err());
    }

    #[test]
    fn safe_filename_rejects_traversal() {
        assert!(safe_filename("../secret.gguf").is_err());
        assert!(safe_filename("/etc/passwd.gguf").is_err());
    }

    #[test]
    fn safe_filename_accepts_gguf() {
        assert_eq!(
            safe_filename("model-Q4_K_M.gguf").unwrap(),
            "model-Q4_K_M.gguf"
        );
    }

    #[test]
    fn percent_encode_path_handles_spaces() {
        assert_eq!(
            percent_encode_path("folder/my file.gguf"),
            "folder/my%20file.gguf"
        );
    }

    #[test]
    fn metadata_matches_requires_same_revision() {
        let meta = HfPartialMetadata {
            repo: "owner/model".into(),
            file_path: "model.gguf".into(),
            revision: "abc123".into(),
            total_bytes: Some(1024),
        };
        assert!(metadata_matches(
            &meta,
            "owner/model",
            "model.gguf",
            "abc123"
        ));
        assert!(!metadata_matches(
            &meta,
            "owner/model",
            "model.gguf",
            "def456"
        ));
        assert!(!metadata_matches(
            &meta,
            "owner/other",
            "model.gguf",
            "abc123"
        ));
    }

    #[test]
    fn part_meta_path_appends_suffix() {
        let part = PathBuf::from(r"C:\models\model.gguf.part");
        assert_eq!(
            part_meta_path(&part),
            PathBuf::from(r"C:\models\model.gguf.part.meta.json")
        );
    }
}
