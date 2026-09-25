# LLama C++ Launcher

A Windows-focused desktop app for running local [llama.cpp](https://github.com/ggerganov/llama.cpp) models, downloading GGUF files from Hugging Face, and optionally using [Open WebUI](https://github.com/open-webui/open-webui) as the chat front end.

Built with **Tauri 2**, **React**, and **Rust**. Current version: **v1.2.0**.

## What's new in v1.2.0

Version 1.2.0 adds safer, more flexible Open WebUI environment management and brings together launcher improvements for server safety, download recovery, diagnostics, and model preflight checks.

### Open WebUI environment management

- **Choose where a new environment is created.** By default, setup creates `.venv` beside the selected `llama-server` executable. Use **Choose .venv location** to select a different parent folder; the environment directory keeps the standard `.venv` name. The selected parent is remembered, and **Use llama-server folder** restores the default.
- **Remove and recreate an environment.** **Delete selected .venv** asks for confirmation before permanently deleting the selected Python virtual environment. Removal is restricted in the backend to the currently selected, real directory containing `pyvenv.cfg`, and the saved selection is cleared.
- **Protect and repair existing folders.** Setup reuses a compatible Python 3.12 `.venv` and restores `pip` with Python's bundled `ensurepip` if it is missing. It never overwrites an existing incompatible directory. Select another existing environment, delete the selected valid venv, or choose a different parent folder.
- Setup uses Python 3.12. If it is not available on Windows, the launcher can install a separate user-level runtime with the official Python Install Manager without replacing other Python installations.

### Server safety and diagnostics

- Server access defaults to **Local only**. Binding to **Network accessible** displays an unauthenticated-API warning and requires confirmation each time the server starts.
- Rust validates launch addresses, ports, memory/context and sampling ranges, GPU selection, and tensor splits at the IPC boundary.
- The Server tab provides an advisory RAM/VRAM preflight using model size, context, GPU layers, and available hardware memory.
- Settings can export recent logs, build details, and hardware data as JSON with secret fields and common personal paths redacted.
- llama-server health checks require recognized llama.cpp health payloads, preventing unrelated web services on the configured port from being reported as the model server.

### Recoverability and release packaging

- Hugging Face download queue metadata survives restarts; credentials are never persisted, and gated downloads request a token again when resumed.
- Frontend behavior tests are included in CI, alongside TypeScript, lint, formatting, Rust tests, Clippy, and the production frontend build.
- Windows release builds publish the NSIS `.exe` installer only; MSI packaging is disabled.

See [CHANGELOG.md](CHANGELOG.md) for the complete version history and fixes.

## Quick start

1. Download the latest Windows installer from [GitHub Releases](https://github.com/Tyraxiss/LLama-Cpp-Launcher/releases).
2. Install and launch **LLama C++ Launcher** from the Start menu.
3. Point the app at your local `llama-server.exe`, pick a `.gguf` model, and click **Start Server**.
4. Optional: configure Open WebUI in the Server tab if you prefer a full chat UI over llama.cpp's built-in web UI.
5. Optional: use the **Settings** tab to update llama.cpp or Open WebUI in-app.

## Features

### Server

- Launch and stop `llama-server` with saved executable, model, host, port, GPU layers, context size, and sampling settings.
- **Update llama.cpp in-app** from GitHub Releases (Settings tab): choose CPU / CUDA / Vulkan / HIP, download the matching Windows build, and install it next to your current executable.
- **Server settings lock while running** — context, port, GPU layers, and other launch options cannot be changed until you stop the server.
- **Explicit network exposure choice** — local-only is the default; network binding warns in the UI and requires confirmation before starting the unauthenticated API.
- **Advisory memory preflight** — estimates RAM/VRAM pressure from model size, context length, GPU layers, and available hardware memory before launch.
- Rust validates launch settings again at the IPC boundary, including host/port, sampling ranges, batch/context sizes, and tensor splits.
- Scan model folders recursively for `.gguf` files and pick models from a searchable list.
- **Vision projector (mmproj)** support for multimodal models — auto-pair projectors in the same folder or pick manually.
- **Use-case presets** for common tasks (code, chat, writing, research, roleplay, Gemma 4, Qwen 3.6, and more).
- Separate bounded logs for llama-server and Open WebUI.
- Server starts with `--metrics` for future observability endpoints.

### Memory monitoring

- Live **RAM** and **NVIDIA VRAM** usage in the app header, visible as soon as the app opens.
- When the server is running: process memory and per-model load breakdown parsed from server logs (weights, KV cache, compute buffers).

### Hugging Face downloads

- Download public, gated, or private GGUF models directly into your chosen model folder.
- Supports llama.cpp-style shorthand such as `owner/model-GGUF:Q4_K_M`.
- Shows file sizes (including LFS-backed GGUFs).
- **Download queue**: add multiple models and let the launcher download them one at a time; pending queue metadata survives restarts, but HF tokens are never persisted and must be re-entered for gated downloads.
- **Resume interrupted downloads** with partial file retention and discard support.
- **Auto-download matching mmproj** (optional): when enabled on the Downloads tab, queuing a model also queues a name-matched projector from the same repo.

### Open WebUI

- Set up Open WebUI in a standard `.venv` folder beside the selected `llama-server` executable by default, or choose another parent folder for the new `.venv`; the setup never selects Python 3.11.
- Remove the currently selected Python virtual environment after an explicit confirmation, then create a fresh `.venv` in the default or chosen parent folder.
- If Python 3.12 is missing on Windows, the official Python Install Manager can install a separate runtime for your Windows user without replacing other Python installations.
- Start and stop Open WebUI from the managed environment (**llama-server must be running first**).
- Automatically points Open WebUI at the llama.cpp OpenAI-compatible endpoint (`http://host:port/v1`).
- **Restores logs and running status** when you reopen the app after a restart.
- Check **installed vs latest PyPI version** and run `pip install --upgrade open-webui` from the **Settings** tab with streamed log output.

### General

- **Server**, **Downloads**, **Settings**, and **Help** tabs with searchable in-app documentation.
- Dark and light themes with saved preference.
- **Redacted diagnostics export** from Settings includes recent logs, llama.cpp/app build information, and hardware stats.
- Frontend behavior tests run in CI alongside the TypeScript, lint, formatting, and Rust checks.
- Settings persisted locally (executable path, model folders, server defaults, Open WebUI venv, theme) with improved startup save reliability.

## Requirements

|                |                                                                                     |
| -------------- | ----------------------------------------------------------------------------------- |
| **OS**         | Windows 10/11 (x64)                                                                 |
| **llama.cpp**  | A local `llama-server.exe` build                                                    |
| **Open WebUI** | Optional — Python 3.12 venv with `open-webui` installed                             |
| **VRAM stats** | Optional — NVIDIA GPU (VRAM monitoring uses NVML; system RAM works on all machines) |

## Development

```powershell
npm install
npm run generate:types
npm run dev
```

### Useful scripts

| Script                   | Purpose                                    |
| ------------------------ | ------------------------------------------ |
| `npm run dev`            | Start Tauri + Vite in development          |
| `npm run build`          | Production Tauri build / installer         |
| `npm run build:web`      | Frontend-only production build             |
| `npm run lint`           | ESLint                                     |
| `npm run format`         | Prettier write                             |
| `npm run format:check`   | Prettier check                             |
| `npm run generate:types` | Regenerate TS bindings from Rust via ts-rs |

### Open WebUI venv (optional)

To make a manual environment compatible with the app, use Python 3.12 in the same folder as the selected `llama-server.exe`:

```powershell
cd C:\llama.cpp\build\bin\Release
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install open-webui
```

Alternatively, select `llama-server.exe` in the app and use **Set up / Repair Open WebUI environment** on the Server or Settings tab. By default, the app creates the standard `.venv` directory beside that executable. Use **Choose .venv location** to select a different parent folder; setup still creates a directory named `.venv` inside it. The chosen parent folder is remembered locally, and **Use llama-server folder** restores the default. Setup uses Python 3.12 only and installs Open WebUI. An existing `.venv` is never overwritten: a valid Python 3.12 environment is reused, and missing `pip` is restored with Python's bundled `ensurepip`; an incompatible environment must be removed or selected with **Browse for existing venv**. **Delete selected .venv** permanently removes the currently selected virtual environment after confirmation; it refuses folders that are not valid Python venvs. If Python 3.12 is missing on Windows, the official Python Install Manager can install a separate runtime for your user. Setup confirms before downloading; existing Python installations are not replaced. Use **Update Open WebUI** on the Settings tab to upgrade when a newer PyPI release is available.

### Quality checks

CI on `main` runs TypeScript, ESLint, Prettier, `cargo fmt`, `cargo clippy`, Rust tests, and a frontend build on `windows-2022`.

## Releases

Prebuilt Windows installers are published on [GitHub Releases](https://github.com/Tyraxiss/LLama-Cpp-Launcher/releases) when a version tag is pushed. Tags may be short (`v1.2`, which maps to `1.2.0`) or full semantic versions (for example, `v1.2.0`). The workflow builds and publishes the NSIS `.exe` installer only; it does not build MSI packages.

```powershell
git tag v1.2.0
git push origin v1.2.0
```

See [CHANGELOG.md](CHANGELOG.md) for version history.

## License

MIT License. See [LICENSE](LICENSE).
