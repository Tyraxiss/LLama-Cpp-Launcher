import type {
  AppConfig,
  HfDownloadQueueItem,
  ModelInfo,
  ResourceStats,
  ServerSettings,
} from "../types";

export function parseIpv4Address(value: unknown): number[] | null;
export function isLocalBindAddress(value: unknown): boolean;
export function normalizeServerSettings(
  config?: Partial<AppConfig>,
): ServerSettings;
export function suggestMmprojPath(
  modelPath: string,
  mmprojs: ModelInfo[],
): string | null;
export function buildRedactedDiagnostics(input: {
  appVersion: string;
  llamaTag?: string | null;
  llamaBackend?: string | null;
  stats: ResourceStats | null;
  serverLog: string[];
  openWebuiLog: string[];
  exportedAt?: string;
}): {
  exportedAt: string;
  appVersion: string;
  llamaCpp: { tag: string | null; backend: string | null };
  hardware: ResourceStats | null;
  logs: { llamaServer: string[]; openWebui: string[] };
};
export function validateServerSettings(settings: ServerSettings): {
  valid: boolean;
  errors: string[];
};
export function estimateModelMemory(input: {
  modelBytes: number;
  contextSize: number;
  gpuLayers: number;
  mainGpu?: number | null;
  stats: ResourceStats | null;
}): {
  status: "unknown" | "warning" | "ok";
  message: string;
  details: string[];
};
export function serializeDownloadQueue(queue: HfDownloadQueueItem[]): string;
export function deserializeDownloadQueue(value: string | null): HfDownloadQueueItem[];
export function retryQueueItem(
  item: HfDownloadQueueItem,
  token: string,
): (HfDownloadQueueItem & { needsToken?: true }) | null;
export function cancelQueueItem<T extends Partial<HfDownloadQueueItem>>(
  item: T,
): T;
export function redactDiagnosticText(value: unknown): string;
export function redactDiagnosticData(value: unknown): unknown;
