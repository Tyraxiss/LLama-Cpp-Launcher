use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{copy, BufReader, BufWriter, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;

use futures_util::StreamExt;
use regex::Regex;
use serde::{Deserialize, Serialize};
use tauri::{Emitter, State};
use zip::ZipArchive;

use crate::bindings::{
    LlamaCppBackendOption, LlamaCppUpdateInfo, LlamaCppUpdateProgress, LlamaCppUpdateStage,
};
use crate::config::save_config_to_disk;
use crate::state::AppState;

const LLAMA_REPO: &str = "ggml-org/llama.cpp";
const BUILD_MARKER: &str = ".llama-launcher-build.json";
const USER_AGENT: &str = "LLama C++ Launcher/1.0.9";

#[derive(Debug, Serialize, Deserialize, Clone)]
struct BuildMarker {
    tag: String,
    backend: String,
}

#[derive(Debug, Deserialize)]
struct GithubRelease {
    tag_name: String,
    html_url: String,
    assets: Vec<GithubAsset>,
}

#[derive(Debug, Deserialize, Clone)]
struct GithubAsset {
    name: String,
    size: u64,
    browser_download_url: String,
}

fn github_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))
}

fn install_dir_from_exe(exe_path: &str) -> Result<PathBuf, String> {
    let exe = PathBuf::from(exe_path);
    if !exe.is_file() {
        return Err("Selected llama-server executable was not found.".into());
    }
    exe.parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "Could not resolve the llama-server install folder.".into())
}

fn read_build_marker(install_dir: &Path) -> Option<BuildMarker> {
    let path = install_dir.join(BUILD_MARKER);
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

fn write_build_marker(install_dir: &Path, tag: &str, backend: &str) -> Result<(), String> {
    let marker = BuildMarker {
        tag: tag.to_string(),
        backend: backend.to_string(),
    };
    let json = serde_json::to_string_pretty(&marker)
        .map_err(|e| format!("Failed to serialize build marker: {e}"))?;
    fs::write(install_dir.join(BUILD_MARKER), json)
        .map_err(|e| format!("Failed to write build marker: {e}"))
}

fn detect_backend_from_dir(install_dir: &Path) -> String {
    if let Some(marker) = read_build_marker(install_dir) {
        return marker.backend;
    }

    let Ok(entries) = fs::read_dir(install_dir) else {
        return "cpu".into();
    };

    let names: Vec<String> = entries
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.file_name().to_string_lossy().to_lowercase())
        .collect();

    let joined = names.join(" ");
    if joined.contains("ggml-hip") || joined.contains("amdhip") || joined.contains("hipblas") {
        return "hip-radeon".into();
    }
    if joined.contains("ggml-vulkan") || joined.contains("vulkan-1.dll") {
        return "vulkan".into();
    }
    if joined.contains("ggml-cuda") || joined.contains("cudart") || joined.contains("cublas") {
        if joined.contains("13.") || joined.contains("cudart64_13") {
            return "cuda-13.3".into();
        }
        return "cuda-12.4".into();
    }
    "cpu".into()
}

fn detect_installed_tag(install_dir: &Path, config_tag: Option<&str>) -> Option<String> {
    if let Some(marker) = read_build_marker(install_dir) {
        return Some(marker.tag);
    }
    if let Some(tag) = config_tag {
        if !tag.trim().is_empty() {
            return Some(tag.trim().to_string());
        }
    }

    let dir_name = install_dir
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default();
    extract_build_tag(dir_name).or_else(|| {
        let path_str = install_dir.to_string_lossy();
        extract_build_tag(&path_str)
    })
}

pub fn extract_build_tag(text: &str) -> Option<String> {
    let re = Regex::new(r"(?i)\bb(\d+)\b").ok()?;
    re.find(text).map(|m| m.as_str().to_lowercase())
}

fn backend_label(id: &str) -> String {
    match id {
        "cpu" => "Windows x64 (CPU)".into(),
        "cuda-12.4" => "Windows x64 (CUDA 12.4)".into(),
        "cuda-13.3" => "Windows x64 (CUDA 13.3)".into(),
        "vulkan" => "Windows x64 (Vulkan)".into(),
        "hip-radeon" => "Windows x64 (HIP / Radeon)".into(),
        other => other.to_string(),
    }
}

fn parse_backend_id_from_asset(name: &str) -> Option<String> {
    // llama-b10003-bin-win-cuda-12.4-x64.zip / llama-b10003-bin-win-cpu-x64.zip
    let lower = name.to_lowercase();
    if !lower.starts_with("llama-") || !lower.contains("-bin-win-") || !lower.ends_with(".zip") {
        return None;
    }
    if lower.contains("-arm64") {
        return None;
    }
    let after = lower.split_once("-bin-win-")?.1;
    let backend = after.strip_suffix("-x64.zip")?;
    if backend.is_empty() || backend.contains("opencl") || backend.contains("openvino") {
        return None;
    }
    // Keep sycl as optional advanced target
    Some(backend.to_string())
}

fn cudart_asset_for_backend(backend: &str, assets: &[GithubAsset]) -> Option<String> {
    if !backend.starts_with("cuda-") {
        return None;
    }
    let needle = format!(
        "cudart-llama-bin-win-cuda-{}-x64.zip",
        &backend["cuda-".len()..]
    );
    assets
        .iter()
        .find(|asset| asset.name.eq_ignore_ascii_case(&needle))
        .map(|asset| asset.name.clone())
}

fn supported_backends(assets: &[GithubAsset]) -> Vec<LlamaCppBackendOption> {
    let mut options = Vec::new();
    for asset in assets {
        let Some(id) = parse_backend_id_from_asset(&asset.name) else {
            continue;
        };
        // Prefer the common x64 backends first; include sycl if present.
        if !(id == "cpu"
            || id.starts_with("cuda-")
            || id == "vulkan"
            || id == "hip-radeon"
            || id == "sycl")
        {
            continue;
        }
        options.push(LlamaCppBackendOption {
            id: id.clone(),
            label: backend_label(&id),
            asset_name: asset.name.clone(),
            size_bytes: Some(asset.size),
            cudart_asset_name: cudart_asset_for_backend(&id, assets),
        });
    }
    options.sort_by(|a, b| a.label.cmp(&b.label));
    options
}

async fn fetch_latest_release() -> Result<GithubRelease, String> {
    let url = format!("https://api.github.com/repos/{LLAMA_REPO}/releases/latest");
    let response = github_client()?
        .get(url)
        .header(reqwest::header::ACCEPT, "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("Failed to reach GitHub: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "GitHub release lookup failed: HTTP {}",
            response.status().as_u16()
        ));
    }

    response
        .json::<GithubRelease>()
        .await
        .map_err(|e| format!("Failed to parse GitHub release payload: {e}"))
}

fn emit_progress(app: &tauri::AppHandle, progress: LlamaCppUpdateProgress) {
    let _ = app.emit("llama-cpp-update-progress", progress);
}

async fn download_asset(
    app: &tauri::AppHandle,
    asset: &GithubAsset,
    dest: &Path,
) -> Result<(), String> {
    emit_progress(
        app,
        LlamaCppUpdateProgress {
            stage: LlamaCppUpdateStage::Downloading,
            filename: Some(asset.name.clone()),
            downloaded_bytes: 0,
            total_bytes: Some(asset.size),
            message: format!("Downloading {}...", asset.name),
        },
    );

    let response = github_client()?
        .get(&asset.browser_download_url)
        .send()
        .await
        .map_err(|e| format!("Failed to download {}: {e}", asset.name))?;

    if !response.status().is_success() {
        return Err(format!(
            "Download failed for {}: HTTP {}",
            asset.name,
            response.status().as_u16()
        ));
    }

    let total = response.content_length().or(Some(asset.size));
    let mut stream = response.bytes_stream();
    let mut file = BufWriter::new(
        File::create(dest).map_err(|e| format!("Failed to create {}: {e}", dest.display()))?,
    );
    let mut downloaded = 0u64;
    let mut last_emit = 0u64;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download stream error: {e}"))?;
        file.write_all(&chunk)
            .map_err(|e| format!("Failed writing download: {e}"))?;
        downloaded += chunk.len() as u64;
        if downloaded - last_emit >= 1024 * 1024 || total == Some(downloaded) {
            last_emit = downloaded;
            emit_progress(
                app,
                LlamaCppUpdateProgress {
                    stage: LlamaCppUpdateStage::Downloading,
                    filename: Some(asset.name.clone()),
                    downloaded_bytes: downloaded,
                    total_bytes: total,
                    message: format!("Downloading {}...", asset.name),
                },
            );
        }
    }
    file.flush()
        .map_err(|e| format!("Failed to finalize download: {e}"))?;
    if let Some(expected) = total {
        if downloaded != expected {
            let _ = fs::remove_file(dest);
            return Err(format!(
                "Download of {} incomplete ({downloaded} of {expected} bytes).",
                asset.name
            ));
        }
    }
    Ok(())
}

fn extract_zip(zip_path: &Path, dest_dir: &Path) -> Result<(), String> {
    fs::create_dir_all(dest_dir).map_err(|e| format!("Failed to create extract dir: {e}"))?;
    let file = File::open(zip_path).map_err(|e| format!("Failed to open zip: {e}"))?;
    let mut archive =
        ZipArchive::new(BufReader::new(file)).map_err(|e| format!("Invalid zip archive: {e}"))?;

    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("Failed to read zip entry: {e}"))?;
        let Some(enclosed) = entry.enclosed_name() else {
            continue;
        };
        let out_path = dest_dir.join(enclosed);
        if entry.name().ends_with('/') {
            fs::create_dir_all(&out_path).map_err(|e| format!("Failed to create dir: {e}"))?;
            continue;
        }
        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent dir: {e}"))?;
        }
        let mut outfile =
            File::create(&out_path).map_err(|e| format!("Failed to create extracted file: {e}"))?;
        copy(&mut entry, &mut outfile).map_err(|e| format!("Failed to extract file: {e}"))?;
    }
    Ok(())
}

fn find_extracted_server_root(extract_dir: &Path) -> Result<PathBuf, String> {
    let direct = extract_dir.join(if cfg!(windows) {
        "llama-server.exe"
    } else {
        "llama-server"
    });
    if direct.is_file() {
        return Ok(extract_dir.to_path_buf());
    }

    let mut stack = vec![extract_dir.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }
            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or_default()
                .to_lowercase();
            if name == "llama-server.exe" || name == "llama-server" {
                return path
                    .parent()
                    .map(Path::to_path_buf)
                    .ok_or_else(|| "Extracted llama-server has no parent folder.".into());
            }
        }
    }

    Err("llama-server was not found inside the downloaded archive.".into())
}

fn copy_dir_contents(from: &Path, to: &Path) -> Result<(), String> {
    fs::create_dir_all(to).map_err(|e| format!("Failed to prepare install dir: {e}"))?;
    let mut stack = vec![from.to_path_buf()];
    while let Some(dir) = stack.pop() {
        for entry in fs::read_dir(&dir).map_err(|e| format!("Failed to read extract dir: {e}"))? {
            let entry = entry.map_err(|e| format!("Failed to read extract entry: {e}"))?;
            let src = entry.path();
            let rel = src
                .strip_prefix(from)
                .map_err(|e| format!("Failed to relativize path: {e}"))?;
            let dest = to.join(rel);
            if src.is_dir() {
                fs::create_dir_all(&dest).map_err(|e| format!("Failed to create dir: {e}"))?;
                stack.push(src);
            } else {
                if let Some(parent) = dest.parent() {
                    fs::create_dir_all(parent)
                        .map_err(|e| format!("Failed to create parent: {e}"))?;
                }
                fs::copy(&src, &dest).map_err(|e| {
                    format!(
                        "Failed to install {} (is llama-server still running?): {e}",
                        dest.display()
                    )
                })?;
            }
        }
    }
    Ok(())
}

fn collect_filenames(root: &Path) -> Result<HashSet<String>, String> {
    let mut names = HashSet::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        for entry in fs::read_dir(&dir).map_err(|e| format!("Failed to scan staging files: {e}"))? {
            let entry = entry.map_err(|e| format!("Failed to read staging entry: {e}"))?;
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                names.insert(name.to_ascii_lowercase());
            }
        }
    }
    Ok(names)
}

fn is_backend_runtime_filename(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.starts_with("ggml-")
        || lower.starts_with("cudart")
        || lower.starts_with("cublas")
        || lower.starts_with("cufft")
        || lower.starts_with("cusparse")
        || lower.starts_with("nvrtc")
        || lower.starts_with("nvjitlink")
        || lower.starts_with("amdhip")
        || lower.starts_with("hipblas")
        || lower.starts_with("rocblas")
        || lower == "vulkan-1.dll"
}

fn remove_stale_backend_runtime(install_dir: &Path, keep: &HashSet<String>) -> Result<(), String> {
    let Ok(entries) = fs::read_dir(install_dir) else {
        return Ok(());
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        let key = name.to_ascii_lowercase();
        if is_backend_runtime_filename(name) && !keep.contains(&key) {
            let _ = fs::remove_file(&path);
        }
    }
    Ok(())
}

fn install_from_staging(staging_root: &Path, install_dir: &Path) -> Result<(), String> {
    let keep = collect_filenames(staging_root)?;
    remove_stale_backend_runtime(install_dir, &keep)?;
    copy_dir_contents(staging_root, install_dir)
}

fn ensure_server_stopped(state: &State<'_, AppState>) -> Result<(), String> {
    let lock = state.child_process.lock().map_err(|e| e.to_string())?;
    if lock.is_some() {
        return Err("Stop llama-server before updating llama.cpp.".into());
    }
    Ok(())
}

fn resolve_asset<'a>(release: &'a GithubRelease, backend: &str) -> Result<&'a GithubAsset, String> {
    let expected = format!("llama-{}-bin-win-{}-x64.zip", release.tag_name, backend);
    release
        .assets
        .iter()
        .find(|asset| asset.name.eq_ignore_ascii_case(&expected))
        .ok_or_else(|| {
            format!(
                "No Windows x64 asset found for backend `{backend}` in {}.",
                release.tag_name
            )
        })
}

fn resolve_cudart_asset<'a>(
    release: &'a GithubRelease,
    backend: &str,
) -> Result<Option<&'a GithubAsset>, String> {
    if !backend.starts_with("cuda-") {
        return Ok(None);
    }
    let name = cudart_asset_for_backend(backend, &release.assets)
        .ok_or_else(|| format!("CUDA runtime package missing for backend `{backend}`."))?;
    release
        .assets
        .iter()
        .find(|asset| asset.name.eq_ignore_ascii_case(&name))
        .map(Some)
        .ok_or_else(|| format!("CUDA runtime package missing for backend `{backend}`."))
}

#[tauri::command]
pub async fn get_llama_cpp_update_info(
    state: State<'_, AppState>,
    exe_path: String,
    backend: Option<String>,
) -> Result<LlamaCppUpdateInfo, String> {
    let install_dir = install_dir_from_exe(&exe_path)?;
    let config = state.config.lock().map_err(|e| e.to_string())?.clone();
    let detected_backend = detect_backend_from_dir(&install_dir);
    let selected_backend = backend
        .filter(|value| !value.trim().is_empty())
        .or(config.llama_cpp_backend.clone())
        .unwrap_or_else(|| detected_backend.clone());
    let installed_tag = detect_installed_tag(&install_dir, config.llama_cpp_tag.as_deref());

    let release = fetch_latest_release().await?;
    let backends = supported_backends(&release.assets);
    if backends.is_empty() {
        return Err(
            "No supported Windows llama.cpp assets were found on the latest release.".into(),
        );
    }

    let selected_backend = if backends.iter().any(|option| option.id == selected_backend) {
        selected_backend
    } else if backends.iter().any(|option| option.id == detected_backend) {
        detected_backend.clone()
    } else {
        backends
            .iter()
            .find(|option| option.id == "cpu")
            .or_else(|| backends.first())
            .map(|option| option.id.clone())
            .unwrap_or_else(|| "cpu".into())
    };

    let update_available = match &installed_tag {
        Some(tag) => !tag.eq_ignore_ascii_case(&release.tag_name),
        None => true,
    };

    Ok(LlamaCppUpdateInfo {
        install_dir: install_dir.to_string_lossy().to_string(),
        installed_tag,
        detected_backend,
        selected_backend,
        latest_tag: release.tag_name,
        update_available,
        release_url: release.html_url,
        backends,
    })
}

#[tauri::command]
pub async fn update_llama_cpp(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    exe_path: String,
    backend: String,
) -> Result<LlamaCppUpdateInfo, String> {
    {
        let lock = state.child_process.lock().map_err(|e| e.to_string())?;
        if lock.is_some() {
            return Err("Stop llama-server before updating llama.cpp.".into());
        }
    }
    {
        let mut updating = state.llama_cpp_updating.lock().map_err(|e| e.to_string())?;
        if *updating {
            return Err("A llama.cpp update is already in progress.".into());
        }
        *updating = true;
    }

    let result = update_llama_cpp_inner(&app_handle, &state, &exe_path, &backend).await;

    match state.llama_cpp_updating.lock() {
        Ok(mut updating) => *updating = false,
        Err(poisoned) => *poisoned.into_inner() = false,
    }

    result
}

async fn update_llama_cpp_inner(
    app_handle: &tauri::AppHandle,
    state: &State<'_, AppState>,
    exe_path: &str,
    backend: &str,
) -> Result<LlamaCppUpdateInfo, String> {
    let install_dir = install_dir_from_exe(exe_path)?;
    emit_progress(
        app_handle,
        LlamaCppUpdateProgress {
            stage: LlamaCppUpdateStage::Checking,
            filename: None,
            downloaded_bytes: 0,
            total_bytes: None,
            message: "Checking latest llama.cpp release...".into(),
        },
    );

    let release = fetch_latest_release().await?;
    let backends = supported_backends(&release.assets);
    if !backends.iter().any(|option| option.id == backend) {
        return Err(format!(
            "Backend `{backend}` is not available in {}.",
            release.tag_name
        ));
    }

    let primary = resolve_asset(&release, backend)?;
    let cudart = resolve_cudart_asset(&release, backend)?;

    let temp_root = std::env::temp_dir().join(format!(
        "llama-launcher-update-{}-{}",
        release.tag_name,
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&temp_root);
    fs::create_dir_all(&temp_root).map_err(|e| format!("Failed to create temp dir: {e}"))?;

    let primary_zip = temp_root.join(&primary.name);
    if let Err(error) = download_asset(app_handle, primary, &primary_zip).await {
        let _ = fs::remove_dir_all(&temp_root);
        emit_progress(
            app_handle,
            LlamaCppUpdateProgress {
                stage: LlamaCppUpdateStage::Error,
                filename: Some(primary.name.clone()),
                downloaded_bytes: 0,
                total_bytes: None,
                message: error.clone(),
            },
        );
        return Err(error);
    }

    let mut cudart_zip = None;
    if let Some(asset) = cudart {
        let path = temp_root.join(&asset.name);
        if let Err(error) = download_asset(app_handle, asset, &path).await {
            let _ = fs::remove_dir_all(&temp_root);
            emit_progress(
                app_handle,
                LlamaCppUpdateProgress {
                    stage: LlamaCppUpdateStage::Error,
                    filename: Some(asset.name.clone()),
                    downloaded_bytes: 0,
                    total_bytes: None,
                    message: error.clone(),
                },
            );
            return Err(error);
        }
        cudart_zip = Some(path);
    }

    emit_progress(
        app_handle,
        LlamaCppUpdateProgress {
            stage: LlamaCppUpdateStage::Extracting,
            filename: Some(primary.name.clone()),
            downloaded_bytes: 0,
            total_bytes: None,
            message: "Extracting llama.cpp archive...".into(),
        },
    );

    let extract_primary = temp_root.join("primary");
    if let Err(error) = extract_zip(&primary_zip, &extract_primary) {
        let _ = fs::remove_dir_all(&temp_root);
        return Err(error);
    }

    let server_root = match find_extracted_server_root(&extract_primary) {
        Ok(path) => path,
        Err(error) => {
            let _ = fs::remove_dir_all(&temp_root);
            return Err(error);
        }
    };

    if let Some(zip_path) = &cudart_zip {
        emit_progress(
            app_handle,
            LlamaCppUpdateProgress {
                stage: LlamaCppUpdateStage::Extracting,
                filename: zip_path
                    .file_name()
                    .map(|name| name.to_string_lossy().to_string()),
                downloaded_bytes: 0,
                total_bytes: None,
                message: "Extracting CUDA runtime DLLs...".into(),
            },
        );
        let extract_cudart = temp_root.join("cudart");
        if let Err(error) = extract_zip(zip_path, &extract_cudart) {
            let _ = fs::remove_dir_all(&temp_root);
            return Err(error);
        }
        if let Err(error) = copy_dir_contents(&extract_cudart, &server_root) {
            let _ = fs::remove_dir_all(&temp_root);
            return Err(error);
        }
    }

    // Stage fully under temp, then copy into the install dir once the server is still stopped.
    let staging_root = temp_root.join("staging");
    if let Err(error) = copy_dir_contents(&server_root, &staging_root) {
        let _ = fs::remove_dir_all(&temp_root);
        return Err(error);
    }

    emit_progress(
        app_handle,
        LlamaCppUpdateProgress {
            stage: LlamaCppUpdateStage::Installing,
            filename: None,
            downloaded_bytes: 0,
            total_bytes: None,
            message: format!("Installing into {}...", install_dir.display()),
        },
    );

    ensure_server_stopped(state)?;

    if let Err(error) = install_from_staging(&staging_root, &install_dir) {
        let _ = fs::remove_dir_all(&temp_root);
        emit_progress(
            app_handle,
            LlamaCppUpdateProgress {
                stage: LlamaCppUpdateStage::Error,
                filename: None,
                downloaded_bytes: 0,
                total_bytes: None,
                message: error.clone(),
            },
        );
        return Err(error);
    }

    write_build_marker(&install_dir, &release.tag_name, backend)?;
    let _ = fs::remove_dir_all(&temp_root);

    let exe_name = if cfg!(windows) {
        "llama-server.exe"
    } else {
        "llama-server"
    };
    let next_exe = install_dir.join(exe_name);
    if !next_exe.is_file() {
        return Err("Update finished but llama-server was not found in the install folder.".into());
    }

    {
        let mut config = state.config.lock().map_err(|e| e.to_string())?;
        config.exe_path = Some(next_exe.to_string_lossy().to_string());
        config.llama_cpp_backend = Some(backend.to_string());
        config.llama_cpp_tag = Some(release.tag_name.clone());
        save_config_to_disk(app_handle, &config)?;
    }

    emit_progress(
        app_handle,
        LlamaCppUpdateProgress {
            stage: LlamaCppUpdateStage::Complete,
            filename: None,
            downloaded_bytes: 0,
            total_bytes: None,
            message: format!("Updated llama.cpp to {}", release.tag_name),
        },
    );

    Ok(LlamaCppUpdateInfo {
        install_dir: install_dir.to_string_lossy().to_string(),
        installed_tag: Some(release.tag_name.clone()),
        detected_backend: backend.to_string(),
        selected_backend: backend.to_string(),
        latest_tag: release.tag_name.clone(),
        update_available: false,
        release_url: release.html_url,
        backends,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_build_tags() {
        assert_eq!(extract_build_tag("llama-b10003-bin"), Some("b10003".into()));
        assert_eq!(
            extract_build_tag(r"C:\llama.cpp\b9910"),
            Some("b9910".into())
        );
        assert_eq!(extract_build_tag("no-tag-here"), None);
    }

    #[test]
    fn parses_windows_backend_ids() {
        assert_eq!(
            parse_backend_id_from_asset("llama-b10003-bin-win-cuda-12.4-x64.zip"),
            Some("cuda-12.4".into())
        );
        assert_eq!(
            parse_backend_id_from_asset("llama-b10003-bin-win-cpu-x64.zip"),
            Some("cpu".into())
        );
        assert_eq!(
            parse_backend_id_from_asset("llama-b10003-bin-win-cpu-arm64.zip"),
            None
        );
        assert_eq!(
            parse_backend_id_from_asset("cudart-llama-bin-win-cuda-12.4-x64.zip"),
            None
        );
    }
}
