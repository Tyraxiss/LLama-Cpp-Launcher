# Changelog

All notable changes to LLama C++ Launcher are documented here.

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
