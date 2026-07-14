import { invoke } from "@tauri-apps/api/core";
import type {
  AppConfig,
  DownloadHistoryItem,
  HfGgufFile,
  ModelInfo,
  OpenWebuiSettings,
  ServerSettings,
} from "../types";
import { DEFAULT_THEME } from "../themes";

export const MAX_LOG_LINES = 200;
export const DOWNLOAD_HISTORY_KEY = "llama-launcher-download-history";

export function appendBoundedLog(lines: string[], line: string): string[] {
  const next = [...lines, line];
  return next.length > MAX_LOG_LINES ? next.slice(next.length - MAX_LOG_LINES) : next;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "—";
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

export function formatPercent(used: number, total: number): string {
  if (total <= 0) return "—";
  return `${Math.round((used / total) * 100)}%`;
}

export function defaultConfig(): AppConfig {
  return {
    exe_path: null,
    open_webui_venv_path: null,
    last_theme: DEFAULT_THEME,
    model_directories: [],
    last_model: null,
    last_mmproj: null,
    last_port: 8080,
    last_host: "127.0.0.1",
    last_open_webui_port: 3000,
    last_open_webui_host: "127.0.0.1",
    last_ctx_size: 8192,
    last_ngl: 99,
    last_temp: 0.7,
    last_threads: 0,
    last_batch_size: 512,
    last_flash_attn: false,
    last_top_p: 0.9,
    last_top_k: 40,
    last_min_p: 0.05,
    last_repeat_penalty: 1.1,
    last_presence_penalty: 0.0,
    last_main_gpu: null,
    last_tensor_split: null,
    last_no_mmap: null,
    last_no_webui: null,
    llama_cpp_backend: null,
    llama_cpp_tag: null,
  };
}

export function samePath(a: string, b: string): boolean {
  const normalize = (path: string) => path.replace(/\\/g, "/").replace(/\/+$/, "");
  return normalize(a).localeCompare(normalize(b), undefined, { sensitivity: "accent" }) === 0;
}

export function isMmprojFilename(filename: string): boolean {
  return filename.toLowerCase().includes("mmproj");
}

export function parentDir(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  return index >= 0 ? filePath.slice(0, index) : "";
}

const MMPROJ_NOISE_TOKENS = new Set([
  "gguf",
  "mmproj",
  "proj",
  "projector",
  "vision",
  "text",
  "f16",
  "f32",
  "bf16",
  "fp16",
  "fp32",
]);

/** Split a GGUF stem into meaningful tokens for mmproj matching. */
export function modelNameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/\.gguf$/i, "")
    .split(/[-_.\s]+/)
    .map((token) => token.trim())
    .filter((token) => {
      // Ignore 1–2 char tokens like "4" / "it" so they cannot meet the match threshold alone.
      if (!token || token.length < 3) return false;
      if (MMPROJ_NOISE_TOKENS.has(token)) return false;
      if (/^q\d+[a-z0-9_]*$/i.test(token)) return false;
      return true;
    });
}

function scoreMmprojForModel(modelPath: string, mmprojFilename: string): number {
  const modelStem = (modelPath.split(/[/\\]/).pop() ?? "").replace(/\.gguf$/i, "");
  const modelTokens = modelNameTokens(modelStem);
  const mmprojTokens = modelNameTokens(mmprojFilename);
  if (modelTokens.length === 0 || mmprojTokens.length === 0) return 0;

  let score = 0;
  const modelSet = new Set(modelTokens);
  for (const token of mmprojTokens) {
    if (modelSet.has(token)) {
      score += token.length >= 4 ? 3 : 2;
    }
  }

  const modelCompact = modelTokens.join("");
  const mmprojCompact = mmprojTokens.join("");
  if (
    modelCompact &&
    mmprojCompact &&
    (modelCompact.includes(mmprojCompact) || mmprojCompact.includes(modelCompact))
  ) {
    score += 4;
  }

  return score;
}

/** Pick a vision projector only when names clearly match the selected model. */
export function suggestMmprojPath(modelPath: string, mmprojs: ModelInfo[]): string | null {
  if (!modelPath) return null;
  const modelDir = parentDir(modelPath);
  const sameDir = mmprojs.filter((mmproj) => samePath(parentDir(mmproj.path), modelDir));
  if (sameDir.length === 0) return null;

  let best: ModelInfo | null = null;
  let bestScore = 0;
  for (const mmproj of sameDir) {
    const score = scoreMmprojForModel(modelPath, mmproj.filename);
    if (score > bestScore) {
      bestScore = score;
      best = mmproj;
    }
  }

  // Require a real name affinity so unrelated mmproj files in the same folder
  // (or text-only models next to a shared projector) are not auto-selected.
  return bestScore >= 2 && best ? best.path : null;
}

/**
 * Prefer a common companion projector when HF repos ship generic names
 * like mmproj-F16.gguf (Unsloth Gemma 4, etc.) with no model tokens.
 * Preference: F16 > BF16/FP16 > F32 > anything else, then smaller size.
 */
function preferHfCompanionMmproj(mmprojs: HfGgufFile[]): HfGgufFile | null {
  if (mmprojs.length === 0) return null;

  const rankPrecision = (filename: string): number => {
    const lower = filename.toLowerCase();
    if (/(^|[-_.])f16([-_.]|$)/.test(lower) || lower.includes("fp16")) return 0;
    if (/(^|[-_.])bf16([-_.]|$)/.test(lower)) return 1;
    if (/(^|[-_.])f32([-_.]|$)/.test(lower) || lower.includes("fp32")) return 2;
    return 3;
  };

  return [...mmprojs].sort((a, b) => {
    const precisionDiff = rankPrecision(a.filename) - rankPrecision(b.filename);
    if (precisionDiff !== 0) return precisionDiff;
    const sizeA = a.size_bytes ?? Number.MAX_SAFE_INTEGER;
    const sizeB = b.size_bytes ?? Number.MAX_SAFE_INTEGER;
    return sizeA - sizeB;
  })[0];
}

/**
 * Pick a matching mmproj from a Hugging Face GGUF listing for the selected model file.
 * Prefer a filename match when present; otherwise fall back to a same-repo companion
 * projector (mmproj-F16.gguf and similar), which is common for Gemma 4 GGUF packs.
 */
export function suggestMmprojFromHfFiles(
  modelFilePath: string,
  files: HfGgufFile[],
): HfGgufFile | null {
  if (!modelFilePath || files.length === 0) return null;

  const selected =
    files.find((file) => file.path === modelFilePath) ??
    ({
      path: modelFilePath,
      filename: modelFilePath.split(/[/\\]/).pop() || modelFilePath,
      size_bytes: null,
    } satisfies HfGgufFile);

  if (isMmprojFilename(selected.filename)) {
    return null;
  }

  const mmprojs = files.filter((file) => isMmprojFilename(file.filename));
  if (mmprojs.length === 0) return null;

  let best: HfGgufFile | null = null;
  let bestScore = 0;
  for (const mmproj of mmprojs) {
    const score = scoreMmprojForModel(selected.filename, mmproj.filename);
    if (score > bestScore) {
      bestScore = score;
      best = mmproj;
    }
  }

  if (bestScore >= 2 && best) {
    return best;
  }

  // HF model repos often ship generic companion projectors without model tokens
  // in the filename (e.g. unsloth/.../mmproj-F16.gguf). Prefer those over failing.
  return preferHfCompanionMmproj(mmprojs);
}

export const AUTO_DOWNLOAD_MMPROJ_KEY = "llama-launcher-auto-download-mmproj";

export function loadAutoDownloadMmproj(): boolean {
  try {
    return localStorage.getItem(AUTO_DOWNLOAD_MMPROJ_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveAutoDownloadMmproj(enabled: boolean): void {
  try {
    localStorage.setItem(AUTO_DOWNLOAD_MMPROJ_KEY, enabled ? "1" : "0");
  } catch {
    // ignore quota / private mode
  }
}

export function serverSettingsFromConfig(cfg: AppConfig): ServerSettings {
  return {
    ctxSize: cfg.last_ctx_size ?? 8192,
    port: cfg.last_port ?? 8080,
    host: cfg.last_host ?? "127.0.0.1",
    ngl: cfg.last_ngl ?? 99,
    temp: cfg.last_temp ?? 0.7,
    threads: cfg.last_threads ?? 0,
    batchSize: cfg.last_batch_size ?? 512,
    topP: cfg.last_top_p ?? 0.9,
    topK: cfg.last_top_k ?? 40,
    minP: cfg.last_min_p ?? 0.05,
    repeatPenalty: cfg.last_repeat_penalty ?? 1.1,
    presencePenalty: cfg.last_presence_penalty ?? 0.0,
    flashAttn: cfg.last_flash_attn ?? false,
    mainGpu: cfg.last_main_gpu ?? null,
    tensorSplit: cfg.last_tensor_split ?? null,
    noMmap: cfg.last_no_mmap ?? false,
    noWebui: cfg.last_no_webui ?? false,
  };
}

export function buildConfigSnapshot(
  base: AppConfig,
  options: {
    exePath?: string;
    modelPath?: string;
    mmprojPath?: string | null;
    theme?: string;
    server?: ServerSettings;
    openWebui?: OpenWebuiSettings;
    llamaCppBackend?: string | null;
    llamaCppTag?: string | null;
  },
): AppConfig {
  const server = options.server;
  const openWebui = options.openWebui;

  return {
    ...base,
    exe_path: options.exePath ?? base.exe_path,
    last_model: options.modelPath ?? base.last_model,
    last_mmproj: options.mmprojPath !== undefined ? options.mmprojPath : base.last_mmproj,
    last_theme: options.theme ?? base.last_theme,
    last_port: server?.port ?? base.last_port,
    last_host: server?.host ?? base.last_host,
    last_ctx_size: server?.ctxSize ?? base.last_ctx_size,
    last_ngl: server?.ngl ?? base.last_ngl,
    last_temp: server?.temp ?? base.last_temp,
    last_threads: server?.threads ?? base.last_threads,
    last_batch_size: server?.batchSize ?? base.last_batch_size,
    last_flash_attn: server?.flashAttn ?? base.last_flash_attn,
    last_top_p: server?.topP ?? base.last_top_p,
    last_top_k: server?.topK ?? base.last_top_k,
    last_min_p: server?.minP ?? base.last_min_p,
    last_repeat_penalty: server?.repeatPenalty ?? base.last_repeat_penalty,
    last_presence_penalty: server?.presencePenalty ?? base.last_presence_penalty,
    last_main_gpu: server?.mainGpu ?? base.last_main_gpu,
    last_tensor_split: server?.tensorSplit ?? base.last_tensor_split,
    last_no_mmap: server?.noMmap ?? base.last_no_mmap,
    last_no_webui: server?.noWebui ?? base.last_no_webui,
    open_webui_venv_path: openWebui?.venvPath ?? base.open_webui_venv_path,
    last_open_webui_port: openWebui?.port ?? base.last_open_webui_port,
    last_open_webui_host: openWebui?.host ?? base.last_open_webui_host,
    llama_cpp_backend:
      options.llamaCppBackend !== undefined ? options.llamaCppBackend : base.llama_cpp_backend,
    llama_cpp_tag: options.llamaCppTag !== undefined ? options.llamaCppTag : base.llama_cpp_tag,
  };
}

export async function persistConfig(cfg: AppConfig): Promise<void> {
  await invoke("save_config", { config: cfg });
}

export function loadDownloadHistory(): DownloadHistoryItem[] {
  try {
    return JSON.parse(localStorage.getItem(DOWNLOAD_HISTORY_KEY) || "[]").slice(0, 8);
  } catch {
    return [];
  }
}

export function saveDownloadHistory(items: DownloadHistoryItem[]) {
  localStorage.setItem(DOWNLOAD_HISTORY_KEY, JSON.stringify(items.slice(0, 8)));
}
