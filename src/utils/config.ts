import { invoke } from "@tauri-apps/api/core";
import type {
  AppConfig,
  DownloadHistoryItem,
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
  };
}

export function samePath(a: string, b: string): boolean {
  return a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0;
}

export function isMmprojFilename(filename: string): boolean {
  return filename.toLowerCase().includes("mmproj");
}

export function parentDir(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  return index >= 0 ? filePath.slice(0, index) : "";
}

/** Pick a vision projector in the same folder as the selected model. */
export function suggestMmprojPath(modelPath: string, mmprojs: ModelInfo[]): string | null {
  if (!modelPath) return null;
  const modelDir = parentDir(modelPath);
  const sameDir = mmprojs.filter((mmproj) => samePath(parentDir(mmproj.path), modelDir));
  if (sameDir.length === 0) return null;
  if (sameDir.length === 1) return sameDir[0].path;

  const modelStem = (modelPath.split(/[/\\]/).pop() ?? "").replace(/\.gguf$/i, "").toLowerCase();
  let best = sameDir[0];
  let bestScore = -1;
  for (const mmproj of sameDir) {
    const filename = mmproj.filename.toLowerCase();
    let score = 0;
    if (filename.includes(modelStem)) score += 10;
    const compactModel = modelStem.replace(/[-_.]/g, "");
    const compactMmproj = filename.replace(/mmproj/gi, "").replace(/[-_.]/g, "");
    if (
      compactModel &&
      (compactMmproj.includes(compactModel) || compactModel.includes(compactMmproj))
    ) {
      score += 5;
    }
    if (score > bestScore) {
      bestScore = score;
      best = mmproj;
    }
  }
  return best.path;
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
