use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;

use serde::Deserialize;
use tauri::{Emitter, Manager, State};
use tauri_plugin_shell::ShellExt;

use crate::bindings::OpenWebUiStartConfig;
use crate::config::open_webui_python;
use crate::process_util::{hidden_command, run_hidden_command_in};
use crate::state::{AppState, MAX_LOG_LINES};

// Resolve the entry point from this venv's metadata instead of using the generated
// Windows launcher, whose shebang can point at a stale Python installation.
const OPEN_WEBUI_CLI_BOOTSTRAP: &str = "from importlib.metadata import entry_points; next(ep for ep in entry_points(group='console_scripts') if ep.name == 'open-webui').load()()";
const SETUP_PYTHON_VERSION: &str = "3.12";
type PythonRuntime = (PathBuf, (u32, u32, u32));

fn parse_python_version(text: &str) -> Option<(u32, u32, u32)> {
    let version = text.split_whitespace().find(|part| {
        part.chars()
            .next()
            .is_some_and(|character| character.is_ascii_digit())
    })?;
    let mut parts = version.split('.');
    Some((
        parts.next()?.parse().ok()?,
        parts.next()?.parse().ok()?,
        parts
            .next()?
            .split(|character: char| !character.is_ascii_digit())
            .next()?
            .parse()
            .ok()?,
    ))
}

fn is_supported_open_webui_python(version: (u32, u32, u32)) -> bool {
    version.0 == 3 && version.1 == 12
}

fn python_output_text(output: &std::process::Output) -> String {
    format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    )
}

fn python_start_error(python: &Path, detail: &str) -> String {
    if detail.to_ascii_lowercase().contains("no python at") {
        return format!(
            "The selected Open WebUI virtual environment is broken because its base Python installation is missing. Windows reports: {detail}. Virtual environments depend on the Python installation used to create them. Restore the missing Python installation, or back up and move the broken .venv before setting up a fresh Python 3.12 environment."
        );
    }
    if detail.is_empty() {
        format!(
            "The venv Python interpreter could not start: {}",
            python.display()
        )
    } else {
        format!("The venv Python interpreter could not start: {detail}")
    }
}

fn python_version_at(path: &Path) -> Option<(u32, u32, u32)> {
    let output = hidden_command(path)
        .env("PYTHONUTF8", "1")
        .env("PYTHONIOENCODING", "utf-8")
        .arg("--version")
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    parse_python_version(&python_output_text(&output))
        .filter(|version| is_supported_open_webui_python(*version))
}

fn add_python_candidate(candidates: &mut Vec<PathBuf>, path: PathBuf) {
    if path.is_file()
        && !candidates.iter().any(|candidate| {
            candidate
                .to_string_lossy()
                .eq_ignore_ascii_case(&path.to_string_lossy())
        })
    {
        candidates.push(path);
    }
}

fn python_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if cfg!(target_os = "windows") {
        if let Some(local_app_data) = std::env::var_os("LOCALAPPDATA").map(PathBuf::from) {
            add_python_candidate(
                &mut candidates,
                local_app_data
                    .join("Programs")
                    .join("Python")
                    .join("Python312")
                    .join("python.exe"),
            );
            for architecture in ["-64", "-32", "-arm64"] {
                add_python_candidate(
                    &mut candidates,
                    local_app_data
                        .join("Python")
                        .join(format!("pythoncore-3.12{architecture}"))
                        .join("python.exe"),
                );
            }
            add_python_candidate(
                &mut candidates,
                local_app_data
                    .join("Python")
                    .join("bin")
                    .join("python3.12.exe"),
            );
        }
        for directory in std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default()) {
            if directory
                .to_string_lossy()
                .to_ascii_lowercase()
                .contains("windowsapps")
            {
                continue;
            }
            for executable in ["python3.12.exe", "python.exe"] {
                add_python_candidate(&mut candidates, directory.join(executable));
            }
        }
        // The legacy launcher and Python Install Manager both support `py -0p`.
        if let Ok(output) = hidden_command("py").args(["-0p"]).output() {
            if output.status.success() {
                for line in String::from_utf8_lossy(&output.stdout).lines() {
                    let bytes = line.as_bytes();
                    let drive = (0..bytes.len().saturating_sub(2)).find(|index| {
                        bytes[*index].is_ascii_alphabetic()
                            && bytes.get(*index + 1) == Some(&b':')
                            && bytes.get(*index + 2) == Some(&b'\\')
                    });
                    if let Some(start) = drive {
                        add_python_candidate(
                            &mut candidates,
                            PathBuf::from(line[start..].trim().trim_matches('"')),
                        );
                    }
                }
            }
        }
    } else {
        for directory in std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default()) {
            for executable in ["python3.12", "python3"] {
                add_python_candidate(&mut candidates, directory.join(executable));
            }
        }
    }
    candidates
}

fn managed_venv_path(root: &Path) -> Result<(PathBuf, Option<PathBuf>), String> {
    let path = root.join(".venv");
    let metadata = match std::fs::symlink_metadata(&path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok((path, None)),
        Err(error) => {
            return Err(format!(
                "Could not check the Open WebUI environment path {}: {error}",
                path.display()
            ));
        }
    };
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(format!(
            "A .venv path already exists in the chosen parent folder: {}. It was not modified. Select it with 'Browse for existing venv' if it already contains Open WebUI, delete the selected environment, or choose another parent folder.",
            path.display()
        ));
    }

    let python = open_webui_python(&path);
    if python_version_at(&python).is_none() {
        return Err(format!(
            "A .venv folder already exists in the chosen parent folder but is not a usable Python 3.12 environment: {}. It was not modified. Select a compatible environment with 'Browse for existing venv', delete that environment, or choose another parent folder.",
            path.display()
        ));
    }
    Ok((path, Some(python)))
}

fn ensure_venv_pip_with(
    venv_path: &Path,
    mut pip_available: impl FnMut() -> Result<bool, String>,
    restore_pip: impl FnOnce() -> Result<(), String>,
) -> Result<(), String> {
    if pip_available().unwrap_or(false) {
        return Ok(());
    }

    restore_pip().map_err(|error| {
        format!(
            "The Python 3.12 environment at {} does not have pip, and Python could not restore it with ensurepip. The existing environment was not deleted. {error}",
            venv_path.display()
        )
    })?;

    match pip_available() {
        Ok(true) => Ok(()),
        Ok(false) => Err(format!(
            "Python could not restore pip in the Open WebUI environment {}. The existing environment was not deleted.",
            venv_path.display()
        )),
        Err(error) => Err(format!(
            "Could not verify pip in the Open WebUI environment {} after repair: {error}",
            venv_path.display()
        )),
    }
}

fn ensure_venv_pip(
    app_handle: &tauri::AppHandle,
    python: &Path,
    venv_path: &Path,
    working_dir: &Path,
) -> Result<(), String> {
    ensure_venv_pip_with(
        venv_path,
        || {
            run_hidden_command_in(python, &["-m", "pip", "--version"], venv_path)
                .map(|output| output.status.success())
                .map_err(|error| error.to_string())
        },
        || {
            run_setup_command(
                app_handle,
                python,
                &["-m".into(), "ensurepip".into(), "--upgrade".into()],
                working_dir,
                "Restoring pip in the existing Python 3.12 environment",
            )
        },
    )
}

#[cfg(test)]
fn compatible_venv_python(version: (u32, u32, u32)) -> bool {
    is_supported_open_webui_python(version)
}

fn llama_cpp_directory(exe_path: &str) -> Result<PathBuf, String> {
    let exe_path = Path::new(exe_path);
    if !exe_path.is_file() {
        return Err(format!(
            "The selected llama-server executable was not found: {}",
            exe_path.display()
        ));
    }
    let canonical_exe = exe_path.canonicalize().map_err(|error| {
        format!(
            "Could not resolve the selected llama-server executable {}: {error}",
            exe_path.display()
        )
    })?;
    canonical_exe
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "Could not determine the selected llama-server folder.".into())
}

fn open_webui_venv_path(exe_path: &str, selected_parent: Option<&str>) -> Result<PathBuf, String> {
    let default_parent = llama_cpp_directory(exe_path)?;
    let parent = match selected_parent.filter(|path| !path.trim().is_empty()) {
        Some(path) => {
            let path = Path::new(path);
            if !path.is_dir() {
                return Err(format!(
                    "The selected Open WebUI environment parent folder does not exist: {}",
                    path.display()
                ));
            }
            path.canonicalize().map_err(|error| {
                format!(
                    "Could not resolve the selected Open WebUI environment parent folder {}: {error}",
                    path.display()
                )
            })?
        }
        None => default_parent,
    };
    Ok(parent.join(".venv"))
}

fn setup_open_webui_sync(
    app_handle: &tauri::AppHandle,
    exe_path: &str,
    selected_parent: Option<&str>,
) -> Result<String, String> {
    let venv_path = open_webui_venv_path(exe_path, selected_parent)?;
    let root = venv_path.parent().ok_or_else(|| {
        "Could not determine the Open WebUI environment parent folder.".to_string()
    })?;
    let (venv_path, existing_venv_python) = managed_venv_path(root)?;

    let venv_python = if let Some(python) = existing_venv_python {
        report_setup_progress(
            app_handle,
            "Reusing the existing Python 3.12 .venv in the chosen parent folder.",
        );
        python
    } else {
        let (base_python, version) = match find_supported_python() {
            Some(python) => python,
            None if cfg!(target_os = "windows") => {
                let manager = match find_python_install_manager() {
                    Some(manager) => manager,
                    None => {
                        let winget = hidden_command("winget").args(["--version"]).output();
                        if !winget.is_ok_and(|output| output.status.success()) {
                            return Err("Open WebUI setup requires Python 3.12. No compatible Python 3.12 or Python Install Manager was found. Install the official Python Install Manager from https://www.python.org/downloads/windows/, then run setup again. Existing Python installations will not be replaced.".into());
                        }
                        run_setup_command(
                            app_handle,
                            Path::new("winget"),
                            &[
                                "install".into(),
                                "--id".into(),
                                "9NQ7512CXL7T".into(),
                                "--exact".into(),
                                "--accept-package-agreements".into(),
                                "--accept-source-agreements".into(),
                                "--silent".into(),
                            ],
                            root,
                            "Installing the official Python Install Manager for this Windows user",
                        )?;
                        find_python_install_manager().ok_or_else(|| {
                            "Python Install Manager was installed, but its command is not available in this app session. Restart the launcher and try setup again.".to_string()
                        })?
                    }
                };

                if find_python_install_manager_runtime(&manager, SETUP_PYTHON_VERSION)?.is_none() {
                    run_setup_command(
                        app_handle,
                        &manager,
                        &["install".into(), SETUP_PYTHON_VERSION.into()],
                        root,
                        "Installing a separate Python 3.12 runtime for this Windows user",
                    )?;
                }
                find_python_install_manager_runtime(&manager, SETUP_PYTHON_VERSION)?.ok_or_else(|| {
                    "Python Install Manager completed, but its Python 3.12 runtime could not be found. Restart the launcher and try setup again.".to_string()
                })?
            }
            None => {
                return Err("Open WebUI setup requires Python 3.12. No compatible Python 3.12 installation was found; install Python 3.12 and run setup again.".into());
            }
        };

        if !is_supported_open_webui_python(version) {
            return Err(
                "Open WebUI setup requires Python 3.12; Python 3.11 is not selected.".into(),
            );
        }

        std::fs::create_dir(&venv_path).map_err(|error| {
            format!(
                "Could not reserve the Open WebUI environment path {} without overwriting existing files: {error}",
                venv_path.display()
            )
        })?;
        run_setup_command(
            app_handle,
            &base_python,
            &[
                "-m".into(),
                "venv".into(),
                venv_path.to_string_lossy().into_owned(),
            ],
            root,
            "Creating the isolated Open WebUI virtual environment in the chosen parent folder",
        )?;
        open_webui_python(&venv_path)
    };
    if python_version_at(&venv_python).is_none() {
        return Err(format!(
            "Python created the environment, but its interpreter could not be started: {}",
            venv_python.display()
        ));
    }
    ensure_venv_pip(app_handle, &venv_python, &venv_path, root)?;

    run_setup_command(
        app_handle,
        &venv_python,
        &[
            "-m".into(),
            "pip".into(),
            "install".into(),
            "--disable-pip-version-check".into(),
            "--upgrade".into(),
            "pip".into(),
        ],
        root,
        "Preparing pip in the isolated environment",
    )?;
    run_setup_command(
        app_handle,
        &venv_python,
        &[
            "-m".into(),
            "pip".into(),
            "install".into(),
            "--disable-pip-version-check".into(),
            "--upgrade".into(),
            "open-webui".into(),
        ],
        root,
        "Installing Open WebUI and its dependencies",
    )?;

    let cli = run_hidden_command_in(
        &venv_python,
        &["-c", OPEN_WEBUI_CLI_BOOTSTRAP, "--help"],
        &venv_path,
    )?;
    if !cli.status.success() {
        let detail = String::from_utf8_lossy(&cli.stderr).trim().to_string();
        return Err(format!(
            "Open WebUI installed, but its command could not be validated: {detail}"
        ));
    }

    report_setup_progress(
        app_handle,
        format!("Open WebUI environment ready at {}", venv_path.display()),
    );
    Ok(venv_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn setup_open_webui(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    exe_path: String,
    venv_parent_path: Option<String>,
) -> Result<String, String> {
    {
        let process = state
            .open_webui_process
            .lock()
            .map_err(|error| error.to_string())?;
        if process.is_some() {
            return Err("Stop Open WebUI before setting up its environment.".into());
        }
        let mut updating = state
            .open_webui_updating
            .lock()
            .map_err(|error| error.to_string())?;
        if *updating {
            return Err("Another Open WebUI setup or update is already running.".into());
        }
        *updating = true;
    }

    let task_result = tauri::async_runtime::spawn_blocking({
        let app_handle = app_handle.clone();
        move || setup_open_webui_sync(&app_handle, &exe_path, venv_parent_path.as_deref())
    })
    .await;
    match state.open_webui_updating.lock() {
        Ok(mut updating) => *updating = false,
        Err(poisoned) => *poisoned.into_inner() = false,
    }
    task_result.map_err(|error| format!("Open WebUI setup task failed: {error}"))?
}

fn selected_venv_for_removal(
    requested_path: &str,
    configured_path: &str,
) -> Result<Option<PathBuf>, String> {
    match std::fs::symlink_metadata(requested_path) {
        Err(error)
            if error.kind() == std::io::ErrorKind::NotFound
                && requested_path == configured_path =>
        {
            return Ok(None);
        }
        Err(error) => {
            return Err(format!(
                "Could not inspect the selected Open WebUI environment {}: {error}",
                Path::new(requested_path).display()
            ));
        }
        Ok(_) => {}
    }

    let selected = removable_venv_path(Path::new(requested_path))?;
    let configured = removable_venv_path(Path::new(configured_path))?;
    if selected != configured {
        return Err(
            "The requested folder is not the currently selected Open WebUI environment.".into(),
        );
    }
    Ok(Some(selected))
}

fn removable_venv_path(path: &Path) -> Result<PathBuf, String> {
    let metadata = std::fs::symlink_metadata(path).map_err(|error| {
        format!(
            "Could not inspect the selected Open WebUI environment {}: {error}",
            path.display()
        )
    })?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(
            "The selected Open WebUI environment must be a real directory, not a symlink.".into(),
        );
    }
    let marker = path.join("pyvenv.cfg");
    let marker_metadata = std::fs::symlink_metadata(&marker).map_err(|_| {
        "The selected folder is not a Python virtual environment (pyvenv.cfg is missing)."
            .to_string()
    })?;
    if marker_metadata.file_type().is_symlink() || !marker_metadata.is_file() {
        return Err("The selected folder is not a valid Python virtual environment.".into());
    }
    path.canonicalize().map_err(|error| {
        format!(
            "Could not resolve the selected Open WebUI environment {}: {error}",
            path.display()
        )
    })
}

#[tauri::command]
pub async fn remove_open_webui_venv(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    venv_path: String,
) -> Result<String, String> {
    {
        let process = state
            .open_webui_process
            .lock()
            .map_err(|error| error.to_string())?;
        if process.is_some() {
            return Err("Stop Open WebUI before removing its environment.".into());
        }
        let mut updating = state
            .open_webui_updating
            .lock()
            .map_err(|error| error.to_string())?;
        if *updating {
            return Err(
                "Wait for Open WebUI setup or update to finish before removing its environment."
                    .into(),
            );
        }
        *updating = true;
    }

    let result = (|| {
        let configured = state
            .open_webui_venv_path
            .lock()
            .map_err(|error| error.to_string())?
            .clone()
            .ok_or_else(|| "No Open WebUI environment is currently selected.".to_string())?;
        let selected = selected_venv_for_removal(&venv_path, &configured)?;
        if let Some(selected) = selected.as_ref() {
            std::fs::remove_dir_all(selected).map_err(|error| {
                format!(
                    "Could not remove the selected Open WebUI environment {}: {error}",
                    selected.display()
                )
            })?;
        }
        *state
            .open_webui_venv_path
            .lock()
            .map_err(|error| error.to_string())? = None;
        let mut config = state.config.lock().map_err(|error| error.to_string())?;
        config.open_webui_venv_path = None;
        let persistence_error = crate::config::save_config_to_disk(&app, &config)
            .err()
            .map(|error| {
                format!(
                    " The saved selection was cleared, but saving the updated settings failed: {error}"
                )
            })
            .unwrap_or_default();
        match selected {
            Some(path) => Ok(format!(
                "Removed Open WebUI environment at {}.{persistence_error}",
                path.display()
            )),
            None => Ok(format!(
                "The selected Open WebUI environment was already missing; cleared its saved selection.{persistence_error}"
            )),
        }
    })();

    match state.open_webui_updating.lock() {
        Ok(mut updating) => *updating = false,
        Err(poisoned) => *poisoned.into_inner() = false,
    }
    result
}

fn find_supported_python() -> Option<(PathBuf, (u32, u32, u32))> {
    python_candidates()
        .into_iter()
        .find_map(|path| python_version_at(&path).map(|version| (path, version)))
}

fn find_python_install_manager() -> Option<PathBuf> {
    if let Some(local_app_data) = std::env::var_os("LOCALAPPDATA").map(PathBuf::from) {
        let alias = local_app_data
            .join("Microsoft")
            .join("WindowsApps")
            .join("pymanager.exe");
        if alias.is_file() {
            return Some(alias);
        }
    }
    ["pymanager", "py"].into_iter().find_map(|executable| {
        hidden_command(executable)
            .args(["help", "install"])
            .output()
            .is_ok_and(|output| output.status.success())
            .then(|| PathBuf::from(executable))
    })
}

fn find_python_install_manager_runtime(
    manager: &Path,
    version_tag: &str,
) -> Result<Option<PythonRuntime>, String> {
    let output = hidden_command(manager)
        .args(["list", "--format=exe", version_tag])
        .output()
        .map_err(|error| format!("Could not query Python Install Manager runtimes: {error}"))?;
    if !output.status.success() {
        return Err(format!(
            "Python Install Manager could not list its {version_tag} runtime: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout)
        .lines()
        .find_map(|line| {
            let path = PathBuf::from(line.trim().trim_matches('"'));
            python_version_at(&path).map(|version| (path, version))
        }))
}

fn report_setup_progress(app_handle: &tauri::AppHandle, message: impl Into<String>) {
    let message = message.into();
    if let Some(state) = app_handle.try_state::<AppState>() {
        if let Ok(mut log) = state.open_webui_log.lock() {
            log.push(message.clone());
            if log.len() > MAX_LOG_LINES {
                let extra = log.len() - MAX_LOG_LINES;
                log.drain(0..extra);
            }
        }
    }
    let _ = app_handle.emit("open-webui-setup-progress", message);
}

fn read_process_output(
    stream: impl std::io::Read + Send + 'static,
    app_handle: tauri::AppHandle,
    last_output: Arc<Mutex<Option<String>>>,
) -> thread::JoinHandle<()> {
    thread::spawn(move || {
        for line in BufReader::new(stream).lines().map_while(Result::ok) {
            if !line.trim().is_empty() {
                if let Ok(mut last) = last_output.lock() {
                    *last = Some(line.clone());
                }
                report_setup_progress(&app_handle, line);
            }
        }
    })
}

fn wait_for_streamed_command(
    mut child: Child,
    stdout: Option<std::process::ChildStdout>,
    stderr: Option<std::process::ChildStderr>,
    app_handle: &tauri::AppHandle,
    phase: &str,
) -> Result<(), String> {
    let last_output = Arc::new(Mutex::new(None));
    let stdout_reader = stdout
        .map(|stream| read_process_output(stream, app_handle.clone(), Arc::clone(&last_output)));
    let stderr_reader = stderr
        .map(|stream| read_process_output(stream, app_handle.clone(), Arc::clone(&last_output)));
    let status = child
        .wait()
        .map_err(|error| format!("Failed while {phase}: {error}"))?;
    if let Some(reader) = stdout_reader {
        let _ = reader.join();
    }
    if let Some(reader) = stderr_reader {
        let _ = reader.join();
    }
    if status.success() {
        Ok(())
    } else {
        let detail = last_output
            .lock()
            .ok()
            .and_then(|output| output.clone())
            .map(|line| format!(" Last output: {line}"))
            .unwrap_or_default();
        Err(format!(
            "Failed while {phase} (exit status {status}).{detail}"
        ))
    }
}

fn run_setup_command(
    app_handle: &tauri::AppHandle,
    program: &Path,
    args: &[String],
    working_dir: &Path,
    phase: &str,
) -> Result<(), String> {
    report_setup_progress(app_handle, format!("{phase}..."));
    let mut child = hidden_command(program)
        .args(args)
        .current_dir(working_dir)
        .env("PYTHONUTF8", "1")
        .env("PYTHONIOENCODING", "utf-8")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Could not start {phase}: {error}"))?;
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    wait_for_streamed_command(child, stdout, stderr, app_handle, phase)
}

pub fn parse_open_webui_version_from_pip_show(text: &str) -> Result<String, String> {
    text.lines()
        .find(|line| line.starts_with("Version:"))
        .map(|line| line.trim_start_matches("Version:").trim().to_string())
        .filter(|version| !version.is_empty())
        .ok_or_else(|| "Could not read open-webui version.".into())
}

fn validate_open_webui_python(venv_path: &Path) -> Result<PathBuf, String> {
    if !venv_path.is_dir() {
        return Err(format!(
            "Selected Open WebUI venv folder was not found: {}",
            venv_path.display()
        ));
    }
    let python = open_webui_python(venv_path);
    if !python.is_file() {
        return Err(format!(
            "Python was not found in the selected venv: {}",
            python.display()
        ));
    }

    let version_output = run_hidden_command_in(&python, &["--version"], venv_path)?;
    if !version_output.status.success() {
        return Err(python_start_error(
            &python,
            &String::from_utf8_lossy(&version_output.stderr),
        ));
    }
    let version = parse_python_version(&python_output_text(&version_output))
        .ok_or_else(|| "Could not determine the selected venv's Python version.".to_string())?;
    if !is_supported_open_webui_python(version) {
        return Err(format!(
            "Open WebUI setup requires Python 3.12. The selected venv uses Python {}.{}.{}; select a compatible Python 3.12 venv or move the current .venv before setting up a fresh environment.",
            version.0, version.1, version.2
        ));
    }
    let pip = run_hidden_command_in(&python, &["-m", "pip", "--version"], venv_path)?;
    if !pip.status.success() {
        let detail = String::from_utf8_lossy(&pip.stderr).trim().to_string();
        return Err(if detail.is_empty() {
            "pip is not available in the selected Open WebUI venv.".into()
        } else {
            format!("pip is not available in the selected Open WebUI venv: {detail}")
        });
    }
    Ok(python)
}

fn read_open_webui_version(venv_path: &Path) -> Result<String, String> {
    let python = validate_open_webui_python(venv_path)?;
    let output = run_hidden_command_in(&python, &["-m", "pip", "show", "open-webui"], venv_path)?;
    if !output.status.success() {
        return Err("open-webui is not installed in this venv.".into());
    }
    parse_open_webui_version_from_pip_show(&String::from_utf8_lossy(&output.stdout))
}

fn append_open_webui_log(app_handle: &tauri::AppHandle, line: &str) {
    if let Some(state) = app_handle.try_state::<AppState>() {
        if let Ok(mut log) = state.open_webui_log.lock() {
            log.push(line.to_string());
            if log.len() > MAX_LOG_LINES {
                let extra = log.len() - MAX_LOG_LINES;
                log.drain(0..extra);
            }
        }
    }
    let _ = app_handle.emit("open-webui-log", line);
}

#[tauri::command]
pub fn get_open_webui_version(venv_path: String) -> Result<String, String> {
    read_open_webui_version(Path::new(&venv_path))
}

#[tauri::command]
pub async fn get_open_webui_latest_version() -> Result<String, String> {
    #[derive(Deserialize)]
    struct PyPiResponse {
        info: PyPiInfo,
    }
    #[derive(Deserialize)]
    struct PyPiInfo {
        version: String,
    }

    let response = reqwest::get("https://pypi.org/pypi/open-webui/json")
        .await
        .map_err(|error| format!("Failed to reach PyPI: {error}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "PyPI lookup failed: HTTP {}",
            response.status().as_u16()
        ));
    }
    let payload: PyPiResponse = response
        .json()
        .await
        .map_err(|error| format!("Failed to parse PyPI response: {error}"))?;
    Ok(payload.info.version)
}

#[tauri::command]
pub async fn update_open_webui(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    venv_path: String,
) -> Result<String, String> {
    {
        let process = state
            .open_webui_process
            .lock()
            .map_err(|error| error.to_string())?;
        if process.is_some() {
            return Err("Stop Open WebUI before updating.".into());
        }
        let mut updating = state
            .open_webui_updating
            .lock()
            .map_err(|error| error.to_string())?;
        if *updating {
            return Err("An Open WebUI setup or update is already in progress.".into());
        }
        *updating = true;
    }

    let venv = PathBuf::from(&venv_path);
    let result = async {
        let python = validate_open_webui_python(&venv)?;
        append_open_webui_log(&app_handle, "Updating open-webui with pip...");
        let (mut receiver, _child) = app_handle
            .shell()
            .command(python.to_string_lossy().to_string())
            .args([
                "-m",
                "pip",
                "install",
                "--disable-pip-version-check",
                "--upgrade",
                "open-webui",
            ])
            .current_dir(&venv)
            .spawn()
            .map_err(|error| format!("Failed to start pip upgrade: {error}"))?;

        use tauri_plugin_shell::process::CommandEvent;
        let mut succeeded = false;
        let mut last_output = String::new();
        while let Some(event) = receiver.recv().await {
            match event {
                CommandEvent::Stdout(bytes) | CommandEvent::Stderr(bytes) => {
                    let text = String::from_utf8_lossy(&bytes).trim().to_string();
                    if !text.is_empty() {
                        last_output = text.clone();
                        append_open_webui_log(&app_handle, &text);
                    }
                }
                CommandEvent::Error(message) => {
                    return Err(format!("pip could not start: {message}"))
                }
                CommandEvent::Terminated(payload) => {
                    if payload.code == Some(0) {
                        succeeded = true;
                        break;
                    }
                    let status = payload
                        .code
                        .map(|code| format!("exit code {code}"))
                        .unwrap_or_else(|| "terminated without exit code".into());
                    return Err(if last_output.is_empty() {
                        format!("pip upgrade failed ({status})")
                    } else {
                        format!("pip upgrade failed ({status}): {last_output}")
                    });
                }
                _ => {}
            }
        }
        if !succeeded {
            return Err("pip upgrade ended without a successful exit status.".into());
        }
        let version = read_open_webui_version(&venv)?;
        append_open_webui_log(
            &app_handle,
            &format!("open-webui updated to version {version}"),
        );
        Ok(format!("Open WebUI updated to v{version}"))
    }
    .await;

    match state.open_webui_updating.lock() {
        Ok(mut updating) => *updating = false,
        Err(poisoned) => *poisoned.into_inner() = false,
    }
    result
}

#[tauri::command]
pub async fn start_open_webui(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    config: OpenWebUiStartConfig,
) -> Result<String, String> {
    {
        let updating = state
            .open_webui_updating
            .lock()
            .map_err(|error| error.to_string())?;
        if *updating {
            return Err("Wait for Open WebUI setup or update to finish before starting.".into());
        }
    }
    let mut process_lock = state
        .open_webui_process
        .lock()
        .map_err(|error| error.to_string())?;
    if process_lock.is_some() {
        return Err("Open WebUI is already running. Stop it first.".into());
    }

    let venv_path = PathBuf::from(&config.venv_path);
    let python = validate_open_webui_python(&venv_path)?;
    let llama_base_url = format!("http://{}:{}/v1", config.llama_host, config.llama_port);
    let webui_url = format!("http://{}:{}", config.host, config.port);
    let args = [
        "-c".to_string(),
        OPEN_WEBUI_CLI_BOOTSTRAP.to_string(),
        "serve".to_string(),
        "--host".to_string(),
        config.host.clone(),
        "--port".to_string(),
        config.port.to_string(),
    ];
    let (receiver, child) = app_handle
        .shell()
        .command(python.to_string_lossy().to_string())
        .args(args)
        .current_dir(&venv_path)
        .env("OPENAI_API_BASE_URLS", &llama_base_url)
        .env("OPENAI_API_KEYS", "sk-local")
        .env("ENABLE_OLLAMA_API", "False")
        .env("CORS_ALLOW_ORIGIN", "*")
        .env("USER_AGENT", "LLama C++ Launcher/1.2.1")
        .env("PYTHONUTF8", "1")
        .env("PYTHONIOENCODING", "utf-8")
        .spawn()
        .map_err(|error| format!("Failed to launch Open WebUI: {error}"))?;

    let app_for_logs = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        use tauri_plugin_shell::process::CommandEvent;
        let mut receiver = receiver;
        while let Some(event) = receiver.recv().await {
            match event {
                CommandEvent::Stdout(bytes) | CommandEvent::Stderr(bytes) => {
                    let text = String::from_utf8_lossy(&bytes).into_owned();
                    if !text.trim().is_empty() {
                        append_open_webui_log(&app_for_logs, &text);
                    }
                }
                CommandEvent::Error(message) => append_open_webui_log(&app_for_logs, &message),
                CommandEvent::Terminated(payload) => {
                    if let Some(state) = app_for_logs.try_state::<AppState>() {
                        if let Ok(mut child) = state.open_webui_process.lock() {
                            let _ = child.take();
                        }
                    }
                    let _ = app_for_logs.emit("open-webui-exited", format!("{payload:?}"));
                    break;
                }
                _ => {}
            }
        }
    });

    *state
        .open_webui_process_venv_path
        .lock()
        .map_err(|error| error.to_string())? = Some(config.venv_path.clone());
    *process_lock = Some(child);
    Ok(format!(
        "Open WebUI started on {webui_url} and connected to {llama_base_url}"
    ))
}

#[tauri::command]
pub fn stop_open_webui(
    state: State<'_, AppState>,
    port: Option<u16>,
    venv_path: Option<String>,
) -> Result<String, String> {
    let mut process_lock = state
        .open_webui_process
        .lock()
        .map_err(|error| error.to_string())?;
    let had_child = process_lock.is_some();
    let process_venv = state
        .open_webui_process_venv_path
        .lock()
        .map_err(|error| error.to_string())?
        .clone();
    let venv = process_venv.or(venv_path);
    let child_error = process_lock.take().and_then(|child| match child.kill() {
        Ok(()) => None,
        Err(error) => Some(error.to_string()),
    });
    let killed = match (port, venv.as_deref()) {
        (Some(port), Some(venv)) => {
            crate::process_util::kill_venv_listeners_on_port(port, Path::new(venv))?
        }
        _ => 0,
    };

    if let Some(error) = child_error.as_ref() {
        if killed == 0 {
            if let Ok(mut path) = state.open_webui_process_venv_path.lock() {
                *path = venv.clone();
            }
            return Err(format!("Failed to kill Open WebUI process: {error}"));
        }
    }
    if let Ok(mut path) = state.open_webui_process_venv_path.lock() {
        *path = if killed == 0 && !had_child {
            venv.clone()
        } else {
            None
        };
    }
    if killed > 0 {
        return Ok(format!(
            "Open WebUI stopped; terminated {killed} process(es) from its venv."
        ));
    }
    if had_child && child_error.is_none() {
        return Ok("Open WebUI process stopped; no matching listener remained.".into());
    }
    Err("No managed Open WebUI process or matching venv listener was found.".into())
}

#[tauri::command]
pub fn get_open_webui_log(state: State<'_, AppState>) -> Vec<String> {
    state
        .open_webui_log
        .lock()
        .map(|log| log.clone())
        .unwrap_or_default()
}

#[tauri::command]
pub fn clear_open_webui_log(state: State<'_, AppState>) {
    if let Ok(mut log) = state.open_webui_log.lock() {
        log.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::{
        compatible_venv_python, ensure_venv_pip_with, is_supported_open_webui_python,
        llama_cpp_directory, managed_venv_path, open_webui_venv_path,
        parse_open_webui_version_from_pip_show, parse_python_version, python_start_error,
        removable_venv_path, selected_venv_for_removal, SETUP_PYTHON_VERSION,
    };
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicUsize, Ordering};

    static TEST_DIR_ID: AtomicUsize = AtomicUsize::new(0);

    fn test_dir() -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "llama-cpp-launcher-open-webui-test-{}-{}",
            std::process::id(),
            TEST_DIR_ID.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn managed_setup_requires_python_312_not_311() {
        assert_eq!(SETUP_PYTHON_VERSION, "3.12");
        assert!(is_supported_open_webui_python((3, 12, 0)));
        assert!(!is_supported_open_webui_python((3, 11, 9)));
        assert!(!is_supported_open_webui_python((3, 13, 0)));
        assert!(compatible_venv_python((3, 12, 1)));
        assert!(!compatible_venv_python((3, 11, 9)));
    }

    #[test]
    fn setup_restores_missing_pip_without_replacing_existing_venv() {
        let root = test_dir();
        let venv = root.join(".venv");
        std::fs::create_dir(&venv).unwrap();
        std::fs::write(venv.join("keep.txt"), "preserve me").unwrap();
        let mut checks = [false, true].into_iter();
        let mut restore_called = false;

        ensure_venv_pip_with(
            &venv,
            || Ok(checks.next().unwrap_or(false)),
            || {
                restore_called = true;
                Ok(())
            },
        )
        .unwrap();

        assert!(restore_called);
        assert_eq!(
            std::fs::read_to_string(venv.join("keep.txt")).unwrap(),
            "preserve me"
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn missing_pip_reports_repair_failure_without_deleting_venv() {
        let root = test_dir();
        let venv = root.join(".venv");
        std::fs::create_dir(&venv).unwrap();
        std::fs::write(venv.join("keep.txt"), "preserve me").unwrap();

        let error = ensure_venv_pip_with(&venv, || Ok(false), || Err("ensurepip failed".into()))
            .unwrap_err();

        assert!(error.contains("existing environment was not deleted"));
        assert_eq!(
            std::fs::read_to_string(venv.join("keep.txt")).unwrap(),
            "preserve me"
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn managed_venv_is_named_dot_venv_and_existing_path_is_preserved() {
        let root = test_dir();
        let (venv, existing_python) = managed_venv_path(&root).unwrap();
        assert_eq!(venv, root.join(".venv"));
        assert!(existing_python.is_none());
        std::fs::create_dir(&venv).unwrap();
        std::fs::write(venv.join("keep.txt"), "preserve me").unwrap();

        let error = managed_venv_path(&root).unwrap_err();
        assert!(error.contains("was not modified"));
        assert_eq!(
            std::fs::read_to_string(venv.join("keep.txt")).unwrap(),
            "preserve me"
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn llama_cpp_directory_uses_selected_executable_parent() {
        let root = test_dir();
        let exe = root.join("llama-server.exe");
        std::fs::write(&exe, "test executable").unwrap();

        assert_eq!(
            llama_cpp_directory(exe.to_str().unwrap()).unwrap(),
            exe.canonicalize().unwrap().parent().unwrap()
        );
        assert!(llama_cpp_directory(root.join("missing.exe").to_str().unwrap()).is_err());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn selected_parent_uses_standard_dot_venv_name() {
        let root = test_dir();
        let exe = root.join("llama-server.exe");
        std::fs::write(&exe, "test executable").unwrap();
        let custom_parent = root.join("Open WebUI");
        std::fs::create_dir(&custom_parent).unwrap();

        assert_eq!(
            open_webui_venv_path(exe.to_str().unwrap(), Some(custom_parent.to_str().unwrap()))
                .unwrap(),
            custom_parent.canonicalize().unwrap().join(".venv")
        );
        assert_eq!(
            open_webui_venv_path(exe.to_str().unwrap(), None).unwrap(),
            root.canonicalize().unwrap().join(".venv")
        );
        assert!(open_webui_venv_path(exe.to_str().unwrap(), Some("missing-folder")).is_err());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn missing_selected_venv_can_be_cleared_without_inspecting_a_missing_path() {
        let root = test_dir();
        let missing = root.join("old-open-webui-venv");
        let missing = missing.to_string_lossy().to_string();

        assert!(selected_venv_for_removal(&missing, &missing)
            .unwrap()
            .is_none());
        assert!(selected_venv_for_removal(&missing, "some-other-venv").is_err());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn existing_venv_removal_still_requires_the_selected_valid_venv() {
        let root = test_dir();
        let venv = root.join(".venv");
        std::fs::create_dir(&venv).unwrap();
        std::fs::write(venv.join("pyvenv.cfg"), "home = python").unwrap();
        let venv_string = venv.to_string_lossy().to_string();

        assert_eq!(
            selected_venv_for_removal(&venv_string, &venv_string).unwrap(),
            Some(venv.canonicalize().unwrap())
        );
        assert!(selected_venv_for_removal(&venv_string, "different-venv").is_err());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn only_python_virtual_environments_can_be_removed() {
        let root = test_dir();
        assert!(removable_venv_path(&root).is_err());
        std::fs::write(root.join("pyvenv.cfg"), "home = python").unwrap();
        assert_eq!(
            removable_venv_path(&root).unwrap(),
            root.canonicalize().unwrap()
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn parses_interpreter_version_output() {
        assert_eq!(parse_python_version("Python 3.12.4"), Some((3, 12, 4)));
        assert_eq!(parse_python_version("Python 3.11.9"), Some((3, 11, 9)));
        assert_eq!(parse_python_version("not a version"), None);
    }

    #[test]
    fn broken_venv_error_recommends_managed_repair() {
        let message = python_start_error(
            Path::new(r"C:\venv\Scripts\python.exe"),
            "No Python at C:\\Python311\\python.exe",
        );
        assert!(message.contains("back up and move the broken .venv"));
        assert!(message.contains("Python 3.12"));
    }

    #[test]
    fn parses_pip_show_version() {
        let output = "Name: open-webui\nVersion: 0.6.15\nSummary: Open WebUI\n";
        assert_eq!(
            parse_open_webui_version_from_pip_show(output).unwrap(),
            "0.6.15"
        );
    }
}
