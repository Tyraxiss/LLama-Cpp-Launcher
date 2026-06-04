# LLama C++ Launcher

A Windows-focused Tauri desktop launcher for running local `llama.cpp` models, managing GGUF downloads from Hugging Face, and optionally using Open WebUI as the chat interface.

## Features

- Launch `llama-server` with saved executable, model, host, port, GPU, context, and sampling settings.
- Scan model folders recursively for `.gguf` files.
- Download public, gated, or private Hugging Face GGUF models directly into your chosen model folder.
- Supports llama.cpp-style Hugging Face shorthand such as `owner/model-GGUF:Q4_K_M`.
- Start Open WebUI from a local Python venv and point it at the llama.cpp `/v1` endpoint.
- Presets for programming, creative writing, Gemma, Qwen, analysis, roleplay, and quick code tasks.
- Dark and light theme options with saved preference.
- Built-in searchable help tab and bounded process logs.

## Requirements

- Windows 10/11
- Node.js
- Rust toolchain
- `llama-server.exe` from a local `llama.cpp` build
- Optional: Open WebUI installed in a Python virtual environment, for example `C:\llama.cpp\.venv`

## Development

Install dependencies:

```powershell
npm install
```

Run the web UI only:

```powershell
npm run dev:web
```

Run the Tauri app in development:

```powershell
npm run dev
```

Build the frontend:

```powershell
npm run build:web
```

Build desktop installers:

```powershell
npm run build
```

Release installers are written under:

```text
src-tauri/target/release/bundle/
```

## Open WebUI Setup

The launcher can start Open WebUI from a venv. A typical setup is:

```powershell
cd C:\llama.cpp
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\pip.exe install open-webui
```

Then select `C:\llama.cpp\.venv` in the app's Open WebUI panel.

## Hugging Face Downloads

Use the Downloads tab to enter a repo such as:

```text
bartowski/Qwen2.5-Coder-7B-Instruct-GGUF:Q4_K_M
```

For gated or private models, paste a Hugging Face token after accepting the model license on Hugging Face.

## GitHub Setup

After creating an empty GitHub repository, add it as a remote:

```powershell
git remote add origin https://github.com/Tyraxiss/LLama-Cpp-Launcher.git
git branch -M main
git push -u origin main
```

## Prebuilt Releases

GitHub Actions builds Windows installers whenever a version tag is pushed.

Create and push a release tag:

```powershell
git tag v1.0.0
git push origin v1.0.0
```

The release workflow attaches the NSIS `.exe` installer to the GitHub Release.

See [CHANGELOG.md](CHANGELOG.md) for release notes.

## License

MIT License. See [LICENSE](LICENSE).
