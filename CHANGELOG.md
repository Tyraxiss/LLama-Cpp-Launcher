# Changelog

All notable changes to LLama C++ Launcher are documented here.

## [Unreleased]

## [1.0.9] - 2026-07-14

### Added

- **In-app llama.cpp updates** from GitHub Releases: detect the current Windows backend (CPU / CUDA / Vulkan / HIP), check the latest ggml-org/llama.cpp tag, download the matching zip (plus CUDA runtime DLLs when needed), and install it next to the selected llama-server.exe.
- **Auto-download matching mmproj** (opt-in on the Downloads tab): when enabled, queuing a model GGUF also queues a matching vision projector from the same Hugging Face repo.
- Dedicated **Settings** tab for llama.cpp and Open WebUI update controls.

### Fixed

- **Open WebUI version/update IPC** again uses Tauri camelCase envPath so version checks and pip upgrades can run.
- **Vision projector auto-pair** no longer selects a random same-folder mmproj (for example a generic mmproj-F16.gguf next to Gemma 4). Matching now requires shared name tokens, and an intentional **None** is no longer overwritten on startup.
- **HF resume/discard IPC** uses camelCase ilePath / argetDir; incomplete downloads are not finalized; resumes require the same revision.
- **llama.cpp updates** persist backend/tag preferences, stage installs before copy, block start during updates, and remove stale backend DLLs when switching backends.
- **Recent Downloads** no longer select an mmproj as the main model.
- Model scan accepts .GGUF case-insensitively; mmproj scoring ignores short noise tokens.
- **HF auto-download mmproj** recognizes generic same-repo companions like mmproj-F16.gguf (Unsloth Gemma 4), preferring F16 over BF16/F32 when names do not share model tokens.
- **Generic mmproj downloads** are saved with a repo suffix (for example mmproj-F16.gemma-4-E4B-it.gguf) so E4B and 12B packs in the same folder do not overwrite each other.
- **Server start** rejects an mmproj whose embedding size does not match the selected text model, with a clear error instead of a late llama.cpp crash.
- **Open WebUI status** no longer flips to Stopped when the process handle is lost but the port is still healthy; Stop also kills orphan listeners on the configured port.
- **Open WebUI Stop** is no longer undone by health auto-revive.
- Health checks require a real HTTP success/redirect status instead of any HTTP/ response.
- Bootstrap config saves merge live UI state so edits during the initial model scan are not overwritten.
- Error toasts stay longer, pause on hover, and support copy/dismiss.

### Changed

- **llama.cpp and Open WebUI update controls** moved from the Server tab to Settings to reduce main-screen clutter.
- Startup is lighter: Open WebUI/PyPI and llama.cpp update checks are deferred; resource stats poll less often and skip redundant UI updates; HF download progress is throttled; model library rescans once per download queue instead of after every file.

## [1.0.8] - 2026-07-08

### Fixed

- **Config persistence**: autosave waits until startup bootstrap finishes so settings are not overwritten with defaults.
- **Stale health checks**: llama-server and Open WebUI health polls are cancelled when the server stops, preventing false error states.
- **Open WebUI invoke args**: version/update commands use the correct `venv_path` parameter for Tauri.
- **HF download saves**: completed downloads persist model library state from the current UI instead of a stale config snapshot.
- **Toast timing**: rapid successive toasts no longer leave orphaned dismiss timers.

### Changed

- **Server settings locked** while llama-server is running, with a prompt to stop the server before editing.
- **Open WebUI** requires llama-server to be running before it can be started.
- **Open WebUI state** reconciles logs and health on app load after a restart.
- Updated app icons and removed the unused `@tauri-apps/plugin-shell` dependency.

## [1.0.7] - 2026-06-25

### Added

- **Vision projector (mmproj) support** for multimodal models (LLaVA, Gemma 3 vision, Qwen-VL, and similar).
- Model scan separates main `.gguf` files from mmproj projectors; mmproj files no longer appear in the main model dropdown.
- **Vision Projector** picker in Model Selection with browse support and optional **None** for text-only models.
- Auto-pairs an mmproj in the same folder when you select a model; choice is persisted in config.
- llama-server starts with `--mmproj` when a projector is selected.
- Hugging Face downloads update both model and mmproj lists and auto-pair after a download completes.

## [1.0.6] - 2026-06-25

### Fixed

- **Hugging Face download resume**: failed or paused queue items now have a **Resume** button; partial downloads are detected from local files without requiring Hugging Face to be online.
- **Resume Download** button shows when a partial file exists or the selected model has a retriable queue entry; re-queuing retries the same item instead of duplicating it.
- Failed/paused queue items stay visible until resumed or cleared (no longer wiped on worker exit).

### Changed

- **Faster HF downloads**: restored direct `resolve/main` URLs (no mandatory pre-download API call), 1 MB buffered disk writes, shared HTTP connection pool, and less frequent progress IPC.

## [1.0.5] - 2026-06-08

### Fixed

- **Hugging Face download queue** now starts the first queued download immediately instead of leaving it stuck on "Queued" until a second model is added.
- Queue worker uses synchronous ref updates so React state batching no longer races with the download processor.

## [1.0.4] - 2026-06-08

### Added

- **Live memory monitoring** in the app header: system RAM, NVIDIA VRAM (via NVML), llama-server process usage, and per-model load breakdown parsed from server logs.
- Memory stats are shown **as soon as the app opens**, not only after the server starts.
- **Hugging Face download queue**: queue multiple GGUF downloads and let the launcher process them one at a time while keeping the form usable.
- **Hugging Face download resume** with partial file retention, resume prompts, and discard support.
- **Open WebUI update** from the launcher: show installed vs latest PyPI version, run `pip install --upgrade open-webui` in the selected venv with streamed log output, and block start while an update is running.
- Shared **Rust → TypeScript IPC types** via ts-rs (`npm run generate:types`).
- **ESLint** and **Prettier** tooling, plus expanded CI checks (format, lint, clippy, tests).
- `@types/node` and `tsconfig.node.json` for Vite config type-checking.

### Changed

- Refactored the frontend: `App.tsx` is split into focused hooks (`useLlamaServer`, `useOpenWebui`, `useHfDownload`, `useResourceStats`, and others) and extracted panels (`ModelSelectionPanel`, `OpenWebuiPanel`, `ServerSettingsPanel`, `HeaderMemoryStats`).
- Refactored the Rust backend into dedicated modules (`config`, `server`, `models`, `hf`, `open_webui`, `resources`, and others) with debounced config persistence and async model folder scanning.
- llama-server now starts with `--metrics` for future observability endpoints.
- Expanded Help tab content for server settings, downloads, Open WebUI, and troubleshooting.

### Fixed

- **Startup lag on Windows**: heavy startup work (model scan, auto-detect, GPU stats, Open WebUI version checks) is staggered so the window paints first.
- **Console window flash on launch**: Open WebUI `pip show` / version checks now run as hidden subprocesses on Windows (`CREATE_NO_WINDOW`).

## [1.0.3] - 2026-06-03

### Fixed

- Fixed the preset card layout at wide window sizes so use-case names stay readable instead of collapsing into abbreviated/ellipsized labels.
- Fixed Hugging Face GGUF file lookup so the downloader requests blob metadata and shows model file sizes instead of `size unknown`.
- Added an LFS metadata fallback for Hugging Face file sizes, which is important because most GGUF model files are stored with Git LFS.

## [1.0.2] - 2026-06-03

### Changed

- Renamed the preset panel from "Quick Presets" to "Use-Case Presets" so the purpose is clearer.
- Renamed presets around user intent:
  - Code: Precise
  - Code: Quick
  - Chat: Balanced
  - Writing: Story
  - Research: Long
  - Character: RP
  - Gemma 4: Code
  - Gemma 4: Writing
  - Qwen 3.6: Code
  - Qwen 3.6: Writing
- Updated preset descriptions so users can choose by task instead of sampling terminology.
- Updated the Help tab's preset documentation to explain the Gemma 4 and Qwen 3.6 tuning choices.

### Tuning

- Updated Gemma 4 presets to use the recommended Gemma defaults: temperature 1.0, top-p 0.95, top-k 64, no min-p filtering, and no extra repeat or presence penalties.
- Kept Qwen 3.6 code preset aligned with Qwen's precise coding and WebDev guidance: temperature 0.6, top-p 0.95, top-k 20, min-p 0, and presence penalty 0.
- Kept Qwen 3.6 writing preset aligned with Qwen's general thinking-mode guidance: temperature 1.0, top-p 0.95, top-k 20, min-p 0, and presence penalty 1.5.
- Adjusted generic code and writing presets for clearer default behavior across non-model-specific GGUFs.

### Fixed

- Downgraded the transitive Rust `http-body` lock entry from 1.0.2 to 1.0.1 so local release builds resolve against the available crates index.

## [1.0.1] - 2026-05-23

### Fixed

- Fixed GitHub Actions dependency installation by pinning Vite to the compatible 7.x line.
- Refreshed `package-lock.json` so `npm ci` succeeds in CI and release builds.
- Updated CI and release workflows to use `windows-2022` instead of `windows-latest`.
- Opted GitHub Actions into Node 24 behavior to avoid Node 20 action runtime deprecation warnings.
- Changed the release workflow to publish the NSIS Windows installer only.

### Release

- Bumped the app from `1.0.0` to `1.0.1`.
- Published the first successful prebuilt Windows installer release.

## [1.0.0] - 2026-05-23

### Added

- Initial tagged version of LLama C++ Launcher.
- Launch and manage local `llama.cpp` `llama-server` processes.
- Persist server executable, model paths, scan folders, model settings, and theme choice.
- Scan model folders recursively for `.gguf` files.
- Download GGUF models from Hugging Face into the selected model folder.
- Support llama.cpp-style Hugging Face shorthand such as `owner/model-GGUF:Q4_K_M`.
- Optional Open WebUI launch support from a local Python virtual environment.
- Server, Downloads, and Help tabs.
- Dark and light themes.
- Built-in searchable help content.
- Prebuilt Windows NSIS installer release workflow.

### Notes

- The `v1.0.0` tag set up the initial release workflow, but the first successful published GitHub Release with a prebuilt installer was `v1.0.1`.
