export type {
  AppConfig,
  HfDownloadConfig,
  HfDownloadProgress,
  HfDownloadStatus,
  HfGgufFile,
  HfPartialDownload,
  LlamaCppBackendOption,
  LlamaCppUpdateInfo,
  LlamaCppUpdateProgress,
  LlamaCppUpdateStage,
  ModelInfo,
  ModelScanResult,
  ModelMemoryBreakdown,
  OpenWebUiStartConfig,
  ResourceStats,
  ServerStartConfig,
} from "./generated/bindings";

/** Frontend-only: persisted in localStorage, not from Rust IPC. */
export interface DownloadHistoryItem {
  repo: string;
  filename: string;
  path: string;
  completed_at: string;
}

export type HfDownloadQueueStatus = "pending" | "downloading" | "complete" | "cancelled" | "error";

/** Frontend-only: queued Hugging Face downloads processed sequentially. */
export interface HfDownloadQueueItem {
  id: string;
  repo: string;
  file_path: string;
  filename: string;
  target_dir: string;
  token: string | null;
  status: HfDownloadQueueStatus;
  error?: string;
  result_path?: string;
}

/** Frontend-only: camelCase view of persisted server settings. */
export interface ServerSettings {
  ctxSize: number;
  port: number;
  host: string;
  ngl: number;
  temp: number;
  threads: number;
  batchSize: number;
  topP: number;
  topK: number;
  minP: number;
  repeatPenalty: number;
  presencePenalty: number;
  flashAttn: boolean;
  mainGpu: number | null;
  tensorSplit: string | null;
  noMmap: boolean;
  noWebui: boolean;
}

/** Frontend-only: Open WebUI panel state. */
export interface OpenWebuiSettings {
  venvPath: string;
  host: string;
  port: number;
}
