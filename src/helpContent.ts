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
    id: "quick-start",
    title: "Quick Start",
    summary: "The shortest path from a fresh install to a running local model.",
    items: [
      { term: "Select llama-server", detail: "Use Server Executable to pick your llama-server.exe. The app tries common llama.cpp locations first." },
      { term: "Add a model folder", detail: "Use Add Scan Dir in Model Selection or Downloads. Folders are scanned recursively for .gguf files." },
      { term: "Choose a model", detail: "Pick a scanned model from the dropdown, or browse directly to a .gguf file." },
      { term: "Apply a preset", detail: "Presets tune context, temperature, sampling, GPU layers, and related options for a specific use case." },
      { term: "Start Server", detail: "Starts llama-server with the current model and settings. The endpoint appears as http://host:port." },
    ],
  },
  {
    id: "server-settings",
    title: "Server Settings",
    summary: "What each llama.cpp launch option does.",
    items: [
      { term: "Host", detail: "The network interface llama-server binds to. 127.0.0.1 is local-only and safest for normal desktop use." },
      { term: "Port", detail: "The HTTP port used by llama-server. Use a different port if another app is already using 8080." },
      { term: "Context Length", detail: "Maximum token window. Larger values allow longer chats but require more memory and may reduce speed." },
      { term: "GPU Layers (NGL)", detail: "Number of model layers offloaded to GPU. 0 is CPU-only; high values use more VRAM but are faster." },
      { term: "Main GPU Device", detail: "Selects the primary GPU for multi-GPU systems. Auto-detect is usually best on single-GPU systems." },
      { term: "Tensor Split", detail: "Manual multi-GPU split, such as 0.6,0.4. Leave blank unless you know your GPU memory layout." },
      { term: "No Memory Map", detail: "Disables memory mapping. This can help with certain file or drive issues, but may increase RAM use." },
      { term: "API Only (no Web UI)", detail: "Disables llama.cpp's built-in web UI. Recommended when using Open WebUI instead." },
      { term: "CPU Threads", detail: "CPU worker thread count. 0 lets llama.cpp choose automatically." },
      { term: "Batch Size", detail: "Prompt processing batch size. Higher can be faster but uses more memory." },
    ],
  },
  {
    id: "sampling",
    title: "Sampling Options",
    summary: "Controls that shape the model's answer style.",
    items: [
      { term: "Temperature", detail: "Lower values are more deterministic; higher values are more varied. Code usually benefits from lower temperature." },
      { term: "Top-P", detail: "Limits sampling to the most likely token mass. Typical values are 0.9 to 0.97." },
      { term: "Top-K", detail: "Limits sampling to the top K likely tokens. Smaller values can make output more focused." },
      { term: "Min-P", detail: "Filters low-probability tokens relative to the best token. Often useful for modern local models." },
      { term: "Repeat Penalty", detail: "Discourages repeated phrasing. Too high can make text unnatural." },
      { term: "Presence Penalty", detail: "Encourages new topics or wording. Useful for some creative presets, but can hurt strict coding output." },
      { term: "Flash Attention", detail: "Uses optimized attention when your llama.cpp build and hardware support it." },
    ],
  },
  {
    id: "presets",
    title: "Presets",
    summary: "Fast profiles for common model behaviors.",
    items: [
      { term: "Programming", detail: "Low-variance settings for code, debugging, and precise edits." },
      { term: "Creative Writing", detail: "More variation for prose without pushing too far into incoherence." },
      { term: "Gemma and Qwen presets", detail: "Profiles tuned for the two local model families you use most." },
      { term: "Deep Analysis", detail: "Larger context and stable sampling for long documents or reasoning tasks." },
      { term: "Quick Code", detail: "Short-context, crisp output for quick snippets and small fixes." },
    ],
  },
  {
    id: "downloads",
    title: "Model Downloads",
    summary: "Download GGUF models from Hugging Face directly into your model folders.",
    items: [
      { term: "Repo format", detail: "Use owner/model-GGUF, or llama.cpp shorthand like owner/model-GGUF:Q4_K_M." },
      { term: "Find GGUF Files", detail: "Looks up public or token-authorized files and lists only .gguf files." },
      { term: "Filter and sort", detail: "Filter by quant or filename, then sort by name, smallest, or largest file." },
      { term: "Target folder", detail: "Choose where the .gguf should be saved. New folders can be added with the browse button." },
      { term: "Partial downloads", detail: "Downloads are written as .part files first and renamed when complete." },
      { term: "Recent Downloads", detail: "Completed downloads are remembered locally so you can quickly reselect them." },
      { term: "HF token", detail: "Only needed for private or gated models after you have accepted the model license on Hugging Face." },
    ],
  },
  {
    id: "open-webui",
    title: "Open WebUI",
    summary: "Use Open WebUI as the front end while llama.cpp serves the model.",
    items: [
      { term: "Venv folder", detail: "Select the virtual environment that contains open-webui.exe. Your expected folder is C:\\llama.cpp\\.venv." },
      { term: "Open WebUI port", detail: "Defaults to 3000 to avoid colliding with llama-server on 8080." },
      { term: "Backend endpoint", detail: "The launcher points Open WebUI at llama.cpp's OpenAI-compatible endpoint: http://host:port/v1." },
      { term: "API Only mode", detail: "Enable API Only in Server Settings when you want Open WebUI instead of llama.cpp's built-in UI." },
      { term: "Logs", detail: "Open WebUI logs are separate from llama-server logs so startup and Python errors are easier to diagnose." },
    ],
  },
  {
    id: "themes",
    title: "Themes",
    summary: "Change the look of the app without changing behavior.",
    items: [
      { term: "Theme selector", detail: "Use the header dropdown to choose one of the dark or light themes." },
      { term: "Persistence", detail: "The selected theme is saved in the app config and restored on launch." },
      { term: "Legibility", detail: "Themes use shared semantic text colors so statuses, buttons, and labels remain readable." },
    ],
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting",
    summary: "Common problems and what to check first.",
    items: [
      { term: "Server will not start", detail: "Confirm llama-server.exe exists, the model path exists, and the port is not already in use." },
      { term: "No models found", detail: "Add a scan directory that contains .gguf files, then press Rescan." },
      { term: "Download denied", detail: "Check that the repo exists. If it is gated/private, accept the license on Hugging Face and add a token." },
      { term: "Open WebUI exits immediately", detail: "Open the Open WebUI Log. Python venv issues and missing dependencies usually show up there." },
      { term: "Out of memory", detail: "Use a smaller quant, lower context length, reduce GPU layers, or choose a smaller model." },
      { term: "Port conflict", detail: "Change the llama-server or Open WebUI port if another local service is already using it." },
    ],
  },
];
