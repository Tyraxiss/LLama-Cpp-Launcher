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
    title: "What's New (1.0.9)",
    summary: "Updates, safer downloads, and a lighter startup in this release.",
    items: [
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
          "If Open WebUI keeps serving after the process handle is lost, the launcher still shows Running when the port responds. Stop can kill orphan listeners on that port.",
      },
      {
        term: "Vision projector matching",
        detail:
          "Auto-pair only when filenames share meaningful tokens. An intentional None stays None across restarts. Server start also checks embedding-size compatibility before launching.",
      },
      {
        term: "Lighter startup",
        detail:
          "Version and update network checks are deferred; resource polling and download progress updates are less aggressive so the UI stays responsive.",
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
        term: "Host",
        detail:
          "The network interface llama-server binds to. 127.0.0.1 is local-only and safest for normal desktop use.",
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
          "Only needed for private or gated models after you have accepted the model license on Hugging Face.",
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
          "Select the virtual environment that contains open-webui.exe. Your expected folder is C:\\llama.cpp\\.venv.",
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
          "Open the Open WebUI Log. Python venv issues and missing dependencies usually show up there. Also confirm llama-server is running first.",
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
