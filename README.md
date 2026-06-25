# LLama C++ Launcher

A Windows-focused desktop app for running local [llama.cpp](https://github.com/ggerganov/llama.cpp) models, downloading GGUF files from Hugging Face, and optionally using [Open WebUI](https://github.com/open-webui/open-webui) as the chat front end.

Built with **Tauri 2**, **React**, and **Rust**. Current version: **1.0.6**.

## Quick start

1. Download the latest Windows installer from [GitHub Releases](https://github.com/Tyraxiss/LLama-Cpp-Launcher/releases).
2. Install and launch **LLama C++ Launcher** from the Start menu.
3. Point the app at your local `llama-server.exe`, pick a `.gguf` model, and click **Start Server**.
4. Optional: configure Open WebUI in the Server tab if you prefer a full chat UI over llama.cpp's built-in web UI.

## Features

### Server

- Launch and stop `llama-server` with saved executable, model, host, port, GPU layers, context size, and sampling settings.
- Scan model folders recursively for `.gguf` files and pick models from a searchable list.
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

### Open WebUI

- Start and stop Open WebUI from a local Python virtual environment.
- Automatically points Open WebUI at the llama.cpp OpenAI-compatible endpoint (`http://host:port/v1`).
- Check **installed vs latest PyPI version** and run `pip install --upgrade open-webui` from the app with streamed log output.

### General

- **Server**, **Downloads**, and **Help** tabs with searchable in-app documentation.
- Dark and light themes with saved preference.
- Settings persisted locally (executable path, model folders, server defaults, Open WebUI venv, theme).

## Requirements

|                |                                                                                     |
| -------------- | ----------------------------------------------------------------------------------- |
| **OS**         | Windows 10/11 (x64)                                                                 |
| **llama.cpp**  | A local `llama-server.exe` build                                                    |
| **Open WebUI** | Optional — Python venv with `open-webui` installed                                  |
| **VRAM stats** | Optional — NVIDIA GPU (VRAM monitoring uses NVML; system RAM works on all machines) |

For building from source you also need [Node.js](https://nodejs.org/) (22+ recommended) and the [Rust toolchain](https://rustup.rs/).

## Open WebUI setup

A typical venv layout next to your llama.cpp build:

```powershell
cd C:\llama.cpp
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\pip.exe install open-webui
```

Then select `C:\llama.cpp\.venv` in the Open WebUI panel on the Server tab. Use **Update Open WebUI** in the app to upgrade when a newer PyPI release is available.

## Hugging Face downloads

On the **Downloads** tab, enter a repo such as:

```text
bartowski/Qwen2.5-Coder-7B-Instruct-GGUF:Q4_K_M
```

For gated or private models, paste a Hugging Face token after accepting the model license on Hugging Face. You can queue several downloads; the launcher processes them sequentially. If a download is interrupted, the app offers to resume or discard the partial file.

## Development

Clone the repository and install dependencies:

```powershell
git clone https://github.com/Tyraxiss/LLama-Cpp-Launcher.git
cd LLama-Cpp-Launcher
npm install
```

Common commands:

| Command                  | Description                                       |
| ------------------------ | ------------------------------------------------- |
| `npm run dev`            | Run the Tauri app in development                  |
| `npm run dev:web`        | Run the Vite frontend only (browser)              |
| `npm run build`          | Build release installers (NSIS + MSI)             |
| `npm run lint`           | ESLint                                            |
| `npm run format`         | Prettier (write)                                  |
| `npm run generate:types` | Regenerate Rust → TypeScript IPC bindings (ts-rs) |

Release installers are written to:

```text
src-tauri/target/release/bundle/
```

### Project layout

```text
src/                 React UI (hooks, components, presets, help)
src-tauri/src/       Rust backend (server, HF downloads, Open WebUI, resources)
src/generated/       ts-rs bindings (regenerate with npm run generate:types)
.github/workflows/   CI and release automation
```

### Quality checks

CI on `main` runs TypeScript, ESLint, Prettier, `cargo fmt`, `cargo clippy`, Rust tests, and a frontend build on `windows-2022`.

## Releases

Prebuilt Windows installers are published on [GitHub Releases](https://github.com/Tyraxiss/LLama-Cpp-Launcher/releases) when a version tag is pushed:

```powershell
git tag v1.0.6
git push origin v1.0.6
```

The release workflow builds the NSIS `.exe` installer and attaches it to the GitHub Release. See [CHANGELOG.md](CHANGELOG.md) for version history.

## License

MIT License. See [LICENSE](LICENSE).
