# LLama C++ Launcher

A Windows-focused desktop app for running local [llama.cpp](https://github.com/ggerganov/llama.cpp) models, downloading GGUF files from Hugging Face, and optionally using [Open WebUI](https://github.com/open-webui/open-webui) as the chat front end.

Built with **Tauri 2**, **React**, and **Rust**. Current version: **1.0.9**.

## What's new in 1.0.9

### Added

- **In-app llama.cpp updates** from the **Settings** tab — pick CPU / CUDA / Vulkan / HIP, download the latest Windows build from GitHub Releases, and install it next to your current `llama-server.exe`.
- **Auto-download matching mmproj** (optional on Downloads) — queue a same-repo vision projector with the model (name match, or companions like `mmproj-F16.gguf`).
- Dedicated **Settings** tab for update controls so the Server workspace stays focused on launch.

### Fixes

- Safer Hugging Face resume/discard (correct Tauri camelCase args, revision pinning, incomplete-file protection).
- Generic Unsloth-style `mmproj-F16.gguf` companions are recognized and saved with a repo suffix so E4B/12B packs do not overwrite each other.
- Server start rejects mmproj / model embedding mismatches before llama.cpp crashes.
- Open WebUI status tracks the live port (and Stop can kill orphan listeners); intentional Stop is no longer undone by health polling.
- Tighter vision-projector auto-pair; intentional **None** sticks across restarts.
- Error toasts stay longer with copy/dismiss; startup and download UI are lighter under load.

See [CHANGELOG.md](CHANGELOG.md) for the full version history.

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
- **Download queue**: add multiple models and let the launcher download them one at a time.
- **Resume interrupted downloads** with partial file retention and discard support.
- **Auto-download matching mmproj** (optional): when enabled on the Downloads tab, queuing a model also queues a name-matched projector from the same repo.

### Open WebUI

- Start and stop Open WebUI from a local Python virtual environment (**llama-server must be running first**).
- Automatically points Open WebUI at the llama.cpp OpenAI-compatible endpoint (`http://host:port/v1`).
- **Restores logs and running status** when you reopen the app after a restart.
- Check **installed vs latest PyPI version** and run `pip install --upgrade open-webui` from the **Settings** tab with streamed log output.

### General

- **Server**, **Downloads**, **Settings**, and **Help** tabs with searchable in-app documentation.
- Dark and light themes with saved preference.
- Settings persisted locally (executable path, model folders, server defaults, Open WebUI venv, theme) with improved startup save reliability.

## Requirements

|                |                                                                                     |
| -------------- | ----------------------------------------------------------------------------------- |
| **OS**         | Windows 10/11 (x64)                                                                 |
| **llama.cpp**  | A local `llama-server.exe` build                                                    |
| **Open WebUI** | Optional — Python venv with `open-webui` installed                                  |
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

```powershell
cd C:\llama.cpp
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install open-webui
```

Then select `C:\llama.cpp\.venv` in the Open WebUI panel on the Server tab. Use **Update Open WebUI** on the Settings tab to upgrade when a newer PyPI release is available.

### Quality checks

CI on `main` runs TypeScript, ESLint, Prettier, `cargo fmt`, `cargo clippy`, Rust tests, and a frontend build on `windows-2022`.

## Releases

Prebuilt Windows installers are published on [GitHub Releases](https://github.com/Tyraxiss/LLama-Cpp-Launcher/releases) when a version tag is pushed:

```powershell
git tag v1.0.9
git push origin v1.0.9
```

The release workflow builds the NSIS `.exe` installer and attaches it to the GitHub Release. See [CHANGELOG.md](CHANGELOG.md) for version history.

## License

MIT License. See [LICENSE](LICENSE).
