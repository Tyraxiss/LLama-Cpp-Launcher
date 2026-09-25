export interface HelpSection {
  id: string;
  title: string;
  summary: string;
  items: Array<{
    term: string;
    detail: string;
  }>;
}

export const HELP_SECTIONS: HelpSection[] = [
  {
    id: "whats-new",
    title: "What's New",
    summary: "Safer server access, resilient downloads, and easier diagnostics.",
    items: [
      {
        term: "Network access warning",
        detail:
          "The Server tab defaults to Local only (127.0.0.1). Network accessible (0.0.0.0) exposes the unauthenticated API to other devices, shows a warning, and requires confirmation each time you start the server.",
      },
      {
        term: "Memory preflight",
        detail:
          "Before launch, the Server tab estimates memory from model file size, context length, GPU layers, and available RAM/VRAM. It is intentionally approximate; if it warns, try a smaller context or fewer GPU layers.",
      },
      {
        term: "Open WebUI setup",
        detail:
          "Use Set up / Repair Open WebUI environment on the Server or Settings tab. Setup uses Python 3.12 only and creates a standard .venv folder beside the selected llama-server executable by default. Choose .venv location to select another parent folder; the created environment is still named .venv. Use llama-server folder restores the default. An existing .venv is never overwritten; a valid Python 3.12 venv is reused, and missing pip is restored using Python's bundled ensurepip. An incompatible one can be removed or you can browse to another existing venv. Delete selected .venv permanently removes the current environment after confirmation, and only accepts a valid Python venv folder. If Python 3.12 is missing on Windows, the launcher can install a separate runtime for your Windows user through the official Python Install Manager; other Python installations are left unchanged. Setup asks permission before making downloads.",
      },
      {
        term: "Persistent download queue",
        detail:
          "Queued download metadata is saved locally and restored after restart. Hugging Face tokens are never saved. Re-enter a token in the Downloads tab before resuming a gated or private download.",
      },
      {
        term: "Redacted diagnostics",
        detail:
          "Use Settings > Export redacted diagnostics to save recent logs, app and llama.cpp build details, and hardware stats. Secret fields and detected personal paths are redacted before export.",
      },
      {
        term: "In-app llama.cpp updates",
        detail:
          "Open the Settings tab, pick a backend (CPU, CUDA, Vulkan, or HIP), stop llama-server, then update from the latest ggml-org/llama.cpp GitHub release. The launcher installs into the same folder as your current llama-server.exe.",
      },
      {
        term: "Auto-download matching mmproj",
        detail:
          "Optional Downloads toggle. When enabled, queuing a model GGUF also queues a vision projector from the same Hugging Face repo (name match, or a companion like mmproj-F16.gguf). Leave it off for text-only downloads.",
      },
      {
        term: "Safer Hugging Face downloads",
        detail:
          "Resume and discard use the correct Tauri parameters. Incomplete downloads are not finalized, and resumes continue only when the repo revision still matches. Generic mmproj files are saved with a repo suffix so different model sizes do not overwrite each other.",
      },
      {
        term: "Updates on the Settings tab",
        detail:
          "llama.cpp and Open WebUI update controls live on Settings so the Server workspace stays focused on launch and models. An amber tab dot appears when an update is available.",
      },
      {
        term: "Open WebUI status tracking",
        detail:
          "If Open WebUI keeps serving after the process handle is lost, the launcher still shows Running when the port responds. Stop only terminates matching Open WebUI processes from the configured virtual environment.",
      },
      {
        term: "Vision projector matching",
        detail:
          "Auto-pair only when filenames share meaningful tokens. An intentional None stays None across restarts. Server start also checks embedding-size compatibility before launching.",
      },
      {
        term: "Safer updates and downloads",
        detail:
          "Hugging Face cancellation interrupts pending network reads, and llama.cpp updates restore the previous installation if copying or configuration persistence fails.",
      },
    ],
  },
  {
    id: "quick-start",
    title: "Quick Start",
    summary: "The shortest path from a fresh install to a running local model.",
    items: [
      {
        term: "Select llama-server",
        detail:
          "Use Server Executable to pick your llama-server.exe. The app tries common llama.cpp locations first.",
      },
      {
        term: "Add a model folder",
        detail:
          "Use Add Scan Dir in Model Selection or Downloads. Folders are scanned recursively for .gguf files.",
      },
      {
        term: "Choose a model",
        detail: "Pick a scanned model from the dropdown, or browse directly to a .gguf file.",
      },
      {
        term: "Apply a preset",
        detail:
          "Presets tune context, temperature, sampling, GPU layers, and related options for a specific use case.",
      },
      {
        term: "Start Server",
        detail:
          "Starts llama-server with the current model and settings. The endpoint appears as http://host:port. Server settings cannot be changed while it is running.",
      },
    ],
  },
  {
    id: "server-settings",
    title: "Server Settings",
    summary:
      "What each llama.cpp launch option does. Settings are locked while the server is running.",
    items: [
      {
        term: "While server is running",
        detail:
          "All server settings are read-only until you stop llama-server. This prevents changing launch options mid-run.",
      },
      {
        term: "Network Access",
        detail:
          "Local only binds to 127.0.0.1 and is the recommended default. Network accessible binds to 0.0.0.0; it exposes the unauthenticated API and requires an explicit confirmation before every server start.",
      },
      {
        term: "Port",
        detail:
          "The HTTP port used by llama-server. Use a different port if another app is already using 8080.",
      },
      {
        term: "Context Length",
        detail:
          "Maximum token window. Larger values allow longer chats but require more memory and may reduce speed.",
      },
      {
        term: "GPU Layers (NGL)",
        detail:
          "Number of model layers offloaded to GPU. 0 is CPU-only; high values use more VRAM but are faster.",
      },
      {
        term: "Main GPU Device",
        detail:
          "Selects the primary GPU for multi-GPU systems. Auto-detect is usually best on single-GPU systems.",
      },
      {
        term: "Tensor Split",
        detail:
          "Manual multi-GPU split, such as 0.6,0.4. Leave blank unless you know your GPU memory layout.",
      },
      {
        term: "No Memory Map",
        detail:
          "Disables memory mapping. This can help with certain file or drive issues, but may increase RAM use.",
      },
      {
        term: "API Only (no Web UI)",
        detail: "Disables llama.cpp's built-in web UI. Recommended when using Open WebUI instead.",
      },
      {
        term: "CPU Threads",
        detail: "CPU worker thread count. 0 lets llama.cpp choose automatically.",
      },
      {
        term: "Batch Size",
        detail: "Prompt processing batch size. Higher can be faster but uses more memory.",
      },
    ],
  },
  {
    id: "sampling",
    title: "Sampling Options",
    summary: "Controls that shape the model's answer style.",
    items: [
      {
        term: "Temperature",
        detail:
          "Lower values are more deterministic; higher values are more varied. Code usually benefits from lower temperature.",
      },
      {
        term: "Top-P",
        detail: "Limits sampling to the most likely token mass. Typical values are 0.9 to 0.97.",
      },
      {
        term: "Top-K",
        detail:
          "Limits sampling to the top K likely tokens. Smaller values can make output more focused.",
      },
      {
        term: "Min-P",
        detail:
          "Filters low-probability tokens relative to the best token. Often useful for modern local models.",
      },
      {
        term: "Repeat Penalty",
        detail: "Discourages repeated phrasing. Too high can make text unnatural.",
      },
      {
        term: "Presence Penalty",
        detail:
          "Encourages new topics or wording. Useful for some creative presets, but can hurt strict coding output.",
      },
      {
        term: "Flash Attention",
        detail: "Uses optimized attention when your llama.cpp build and hardware support it.",
      },
    ],
  },
  {
    id: "presets",
    title: "Presets",
    summary: "Fast profiles for common model behaviors.",
    items: [
      {
        term: "Code: Precise",
        detail: "Generic low-variance settings for debugging, refactoring, and exact edits.",
      },
      {
        term: "Writing: Story",
        detail: "Generic prose settings for fiction, scenes, and brainstorming.",
      },
      {
        term: "Gemma 4 presets",
        detail:
          "Uses Google's recommended Gemma 4 defaults: temperature 1.0, top-p 0.95, top-k 64, and no extra penalties.",
      },
      {
        term: "Qwen 3.6 presets",
        detail:
          "Uses Qwen's recommended settings for thinking-mode coding and thinking-mode general writing.",
      },
      {
        term: "Research: Long",
        detail:
          "Larger context and stable sampling for long documents, comparison, and reasoning tasks.",
      },
      { term: "Code: Quick", detail: "Short-context, crisp output for snippets and small fixes." },
    ],
  },
  {
    id: "downloads",
    title: "Model Downloads",
    summary: "Download GGUF models from Hugging Face directly into your model folders.",
    items: [
      {
        term: "Repo format",
        detail: "Use owner/model-GGUF, or llama.cpp shorthand like owner/model-GGUF:Q4_K_M.",
      },
      {
        term: "Find GGUF Files",
        detail: "Looks up public or token-authorized files and lists only .gguf files.",
      },
      {
        term: "Filter and sort",
        detail: "Filter by quant or filename, then sort by name, smallest, or largest file.",
      },
      {
        term: "Target folder",
        detail:
          "Choose where the .gguf should be saved. New folders can be added with the browse button.",
      },
      {
        term: "Auto-download matching mmproj",
        detail:
          "Optional Downloads toggle. When enabled, queuing a model GGUF also queues a vision projector from the same Hugging Face repo. Prefers a filename match when available; otherwise picks a same-repo companion such as mmproj-F16.gguf. Generic mmproj files are saved with a repo suffix locally (for example mmproj-F16.gemma-4-E4B-it.gguf) so different model sizes do not overwrite each other. Leave it off for text-only downloads.",
      },
      {
        term: "Partial downloads",
        detail: "Downloads are written as .part files first and renamed when complete.",
      },
      {
        term: "Recent Downloads",
        detail: "Completed downloads are remembered locally so you can quickly reselect them.",
      },
      {
        term: "HF token",
        detail:
          "Only needed for private or gated models after you have accepted the model license on Hugging Face. Tokens are not saved with the persistent download queue; re-enter one before resuming a protected download after restart.",
      },
    ],
  },
  {
    id: "updates",
    title: "Updates",
    summary: "How to keep Open WebUI and llama.cpp current from the Settings tab.",
    items: [
      {
        term: "Update Open WebUI",
        detail:
          "Open the Settings tab, stop Open WebUI if it is running, then click Update Open WebUI. The launcher runs pip install --upgrade open-webui in your selected venv.",
      },
      {
        term: "Update llama.cpp",
        detail:
          "On Settings, choose the backend that matches your GPU stack, stop llama-server, then click Update llama.cpp to install the latest GitHub release into that folder.",
      },
      {
        term: "Update available badge",
        detail:
          "The Settings tab shows an amber dot when either llama.cpp or Open WebUI has an update available. Version cards also show Installed vs Latest.",
      },
      {
        term: "llama.cpp / llama-server",
        detail:
          "On Settings, pick a backend (CPU, CUDA 12.4, CUDA 13.3, Vulkan, or HIP), then click Update llama.cpp. The launcher downloads the matching Windows zip from ggml-org/llama.cpp releases and installs it next to your current llama-server.exe. Stop the server first. Select the executable on the Server tab if needed.",
      },
      {
        term: "CUDA runtime DLLs",
        detail:
          "CUDA backends also download the matching cudart package and merge those DLLs into the same folder so the new build can run.",
      },
      {
        term: "Installed build tag",
        detail:
          "After an in-app update, the launcher stores the release tag (for example b10003) so it can detect newer builds. Older folders may show Installed: Unknown until you update once.",
      },
    ],
  },
  {
    id: "open-webui",
    title: "Open WebUI",
    summary: "Use Open WebUI as the front end while llama.cpp serves the model.",
    items: [
      {
        term: "Start llama-server first",
        detail:
          "Open WebUI depends on the llama.cpp backend. Start llama-server before clicking Start Open WebUI.",
      },
      {
        term: "Venv folder",
        detail:
          "Use Set up / Repair Open WebUI environment to create the standard .venv folder beside the selected llama-server executable, or choose another parent folder; the environment itself is always named .venv. You can browse to an existing environment. The app never selects Python 3.11. An existing .venv is never overwritten; a valid Python 3.12 venv is reused, and missing pip is restored with Python's bundled ensurepip. An incompatible one can be deleted with Delete selected .venv (after confirmation) or left in place while you choose a different parent folder. Deletion is limited to validated Python virtual environment folders. On Windows, setup can install a separate Python 3.12 runtime for your user through the official Python Install Manager without replacing other Python installations.",
      },
      {
        term: "Open WebUI port",
        detail:
          "Defaults to 3000 to avoid colliding with llama-server on 8080. Host and port are passed on the serve command line. If Open WebUI previously saved different values in its own PersistentConfig database, clear or edit that config in Open WebUI if the UI does not match the launcher settings.",
      },
      {
        term: "Backend endpoint",
        detail:
          "The launcher points Open WebUI at llama.cpp's OpenAI-compatible endpoint: http://host:port/v1.",
      },
      {
        term: "API Only mode",
        detail:
          "Enable API Only in Server Settings when you want Open WebUI instead of llama.cpp's built-in UI.",
      },
      {
        term: "Logs",
        detail:
          "Open WebUI logs are separate from llama-server logs so startup and Python errors are easier to diagnose.",
      },
    ],
  },
  {
    id: "themes",
    title: "Themes",
    summary: "Change the look of the app without changing behavior.",
    items: [
      {
        term: "Theme selector",
        detail: "Use the header dropdown to choose one of the dark or light themes.",
      },
      {
        term: "Persistence",
        detail: "The selected theme is saved in the app config and restored on launch.",
      },
      {
        term: "Legibility",
        detail:
          "Themes use shared semantic text colors so statuses, buttons, and labels remain readable.",
      },
    ],
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting",
    summary: "Common problems and what to check first.",
    items: [
      {
        term: "Server will not start",
        detail:
          "Confirm llama-server.exe exists, the model path exists, and the port is not already in use.",
      },
      {
        term: "No models found",
        detail: "Add a scan directory that contains .gguf files, then press Rescan.",
      },
      {
        term: "Download denied",
        detail:
          "Check that the repo exists. If it is gated/private, accept the license on Hugging Face and add a token.",
      },
      {
        term: "Open WebUI exits immediately",
        detail:
          "Open the Open WebUI Log. If Windows reports 'No Python at ...', the selected venv's base Python installation is missing. Restore that Python or create a fresh venv with a Python version supported by Open WebUI, reinstall Open WebUI, and select the new venv. Also confirm llama-server is running first.",
      },
      {
        term: "Open WebUI shows Stopped but the page still works",
        detail:
          "Open WebUI sometimes keeps serving after the launcher loses its process handle. The app now re-checks the Open WebUI port every few seconds and will show Running again when the page responds. Use Stop to kill whatever is listening on that port.",
      },
      {
        term: "Open WebUI MP3 upload fails (Errno 22)",
        detail:
          "This is a known Open WebUI Windows bug: older builds build audio paths with mixed separators (C:\\...\\uploads/file.mp3), which can fail with [Errno 22] Invalid argument. Stop Open WebUI, open Settings, update Open WebUI via pip, then restart it. Also install ffmpeg on PATH if audio conversion is required. This is not a llama.cpp launcher bug.",
      },
      {
        term: "Cannot change server settings",
        detail:
          "Stop llama-server before editing context, port, GPU layers, or other launch options. Settings are locked while the server is running.",
      },
      {
        term: "Out of memory",
        detail:
          "Use a smaller quant, lower context length, reduce GPU layers, or choose a smaller model.",
      },
      {
        term: "Port conflict",
        detail:
          "Change the llama-server or Open WebUI port if another local service is already using it.",
      },
    ],
  },
];
