# Changelog

All notable changes to LLama C++ Launcher are documented here.

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
