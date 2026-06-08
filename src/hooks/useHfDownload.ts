import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  AppConfig,
  DownloadHistoryItem,
  HfDownloadProgress,
  HfDownloadQueueItem,
  HfGgufFile,
  HfPartialDownload,
  ModelInfo,
} from "../types";
import { loadDownloadHistory, samePath, saveDownloadHistory } from "../utils/config";
import type { ToastType } from "./useToast";

interface UseHfDownloadOptions {
  config: AppConfig;
  saveAppConfig: (cfg: AppConfig) => Promise<void>;
  setModels: (models: ModelInfo[]) => void;
  setModelPath: (path: string) => void;
  showToast: (msg: string, type: ToastType) => void;
}

function queueItemKey(repo: string, filePath: string, targetDir: string): string {
  return `${repo.trim().toLowerCase()}|${filePath}|${targetDir}`;
}

function createQueueItem(
  repo: string,
  filePath: string,
  filename: string,
  targetDir: string,
  token: string | null,
): HfDownloadQueueItem {
  return {
    id: crypto.randomUUID(),
    repo: repo.trim(),
    file_path: filePath,
    filename,
    target_dir: targetDir,
    token: token?.trim() || null,
    status: "pending",
  };
}

export function useHfDownload({
  config,
  saveAppConfig,
  setModels,
  setModelPath,
  showToast,
}: UseHfDownloadOptions) {
  const [hfRepo, setHfRepo] = useState("");
  const [hfToken, setHfToken] = useState("");
  const [hfFiles, setHfFiles] = useState<HfGgufFile[]>([]);
  const [hfSelectedFile, setHfSelectedFile] = useState("");
  const [hfTargetDir, setHfTargetDir] = useState("");
  const [hfLoadingFiles, setHfLoadingFiles] = useState(false);
  const [hfDownloading, setHfDownloading] = useState(false);
  const [hfProgress, setHfProgress] = useState<HfDownloadProgress | null>(null);
  const [hfPartialDownload, setHfPartialDownload] = useState<HfPartialDownload | null>(null);
  const [downloadQueue, setDownloadQueue] = useState<HfDownloadQueueItem[]>([]);
  const [downloadHistory, setDownloadHistory] =
    useState<DownloadHistoryItem[]>(loadDownloadHistory);

  const configRef = useRef(config);
  const saveAppConfigRef = useRef(saveAppConfig);
  const setModelsRef = useRef(setModels);
  const setModelPathRef = useRef(setModelPath);
  const showToastRef = useRef(showToast);
  const downloadQueueRef = useRef(downloadQueue);
  const queueProcessingRef = useRef(false);

  useEffect(() => {
    configRef.current = config;
    saveAppConfigRef.current = saveAppConfig;
    setModelsRef.current = setModels;
    setModelPathRef.current = setModelPath;
    showToastRef.current = showToast;
  }, [config, saveAppConfig, setModels, setModelPath, showToast]);

  useEffect(() => {
    downloadQueueRef.current = downloadQueue;
  }, [downloadQueue]);

  const updateQueue = useCallback(
    (updater: (prev: HfDownloadQueueItem[]) => HfDownloadQueueItem[]) => {
      setDownloadQueue((prev) => {
        const next = updater(prev);
        downloadQueueRef.current = next;
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    const unlisten = listen<HfDownloadProgress>("hf-download-progress", (event) => {
      const payload = event.payload;
      setHfProgress(payload);
      if (payload.status === "downloading") {
        setHfDownloading(true);
      }
      if (["complete", "cancelled", "error"].includes(payload.status)) {
        setHfDownloading(false);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const refreshHfPartialDownload = useCallback(async () => {
    if (!hfRepo.trim() || !hfSelectedFile || !hfTargetDir) {
      return;
    }
    try {
      const partial = (await invoke("get_hf_partial_download", {
        repo: hfRepo.trim(),
        file_path: hfSelectedFile,
        target_dir: hfTargetDir,
        token: hfToken.trim() || null,
      })) as HfPartialDownload | null;
      setHfPartialDownload(partial);
    } catch {
      setHfPartialDownload(null);
    }
  }, [hfRepo, hfSelectedFile, hfTargetDir, hfToken]);

  const canCheckPartial = Boolean(hfRepo.trim() && hfSelectedFile && hfTargetDir);

  useEffect(() => {
    if (!canCheckPartial) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const partial = (await invoke("get_hf_partial_download", {
          repo: hfRepo.trim(),
          file_path: hfSelectedFile,
          target_dir: hfTargetDir,
          token: hfToken.trim() || null,
        })) as HfPartialDownload | null;
        if (!cancelled) {
          setHfPartialDownload(partial);
        }
      } catch {
        if (!cancelled) {
          setHfPartialDownload(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canCheckPartial, hfRepo, hfSelectedFile, hfTargetDir, hfToken]);

  const recordCompletedDownload = useCallback(
    async (item: HfDownloadQueueItem, downloadedPath: string) => {
      const cfg = configRef.current;
      const dirs = cfg.model_directories.some((dir) => samePath(dir, item.target_dir))
        ? cfg.model_directories
        : [...cfg.model_directories, item.target_dir];
      const found = (await invoke("scan_models", { directories: dirs })) as ModelInfo[];
      setModelsRef.current(found);
      setModelPathRef.current(downloadedPath);
      await saveAppConfigRef.current({
        ...cfg,
        model_directories: dirs,
        last_model: downloadedPath,
      });

      setDownloadHistory((prev) => {
        const nextHistory = [
          {
            repo: item.repo,
            filename: downloadedPath.split(/[/\\]/).pop() || downloadedPath,
            path: downloadedPath,
            completed_at: new Date().toISOString(),
          },
          ...prev.filter((entry) => entry.path !== downloadedPath),
        ].slice(0, 8);
        saveDownloadHistory(nextHistory);
        return nextHistory;
      });
    },
    [],
  );

  const processDownloadQueue = useCallback(async () => {
    if (queueProcessingRef.current) {
      return;
    }

    queueProcessingRef.current = true;

    try {
      while (true) {
        const next = downloadQueueRef.current.find((item) => item.status === "pending");
        if (!next) {
          break;
        }

        updateQueue((prev) =>
          prev.map((item) =>
            item.id === next.id ? { ...item, status: "downloading" as const } : item,
          ),
        );
        setHfDownloading(true);
        setHfProgress(null);

        try {
          const downloadedPath = (await invoke("download_hf_model", {
            config: {
              repo: next.repo,
              file_path: next.file_path,
              target_dir: next.target_dir,
              token: next.token,
            },
          })) as string;

          updateQueue((prev) =>
            prev.map((item) =>
              item.id === next.id
                ? { ...item, status: "complete" as const, result_path: downloadedPath }
                : item,
            ),
          );
          await recordCompletedDownload(next, downloadedPath);

          if (
            queueItemKey(hfRepo, hfSelectedFile, hfTargetDir) ===
            queueItemKey(next.repo, next.file_path, next.target_dir)
          ) {
            setHfPartialDownload(null);
          }
        } catch (error) {
          const message = String(error);
          if (message === "Download cancelled") {
            updateQueue((prev) =>
              prev.map((item) =>
                item.id === next.id ? { ...item, status: "cancelled" as const } : item,
              ),
            );
            if (
              hfRepo.trim() === next.repo &&
              hfSelectedFile === next.file_path &&
              samePath(hfTargetDir, next.target_dir)
            ) {
              await refreshHfPartialDownload();
            }
            continue;
          }

          updateQueue((prev) =>
            prev.map((item) =>
              item.id === next.id ? { ...item, status: "error" as const, error: message } : item,
            ),
          );
          showToastRef.current(message, "error");
          if (
            hfRepo.trim() === next.repo &&
            hfSelectedFile === next.file_path &&
            samePath(hfTargetDir, next.target_dir)
          ) {
            await refreshHfPartialDownload();
          }
        } finally {
          setHfProgress(null);
        }
      }
    } finally {
      queueProcessingRef.current = false;
      setHfDownloading(false);

      const remaining = downloadQueueRef.current.filter(
        (item) => item.status === "pending" || item.status === "downloading",
      );
      if (remaining.length === 0) {
        const completed = downloadQueueRef.current.some((item) => item.status === "complete");
        if (completed) {
          showToastRef.current("Queued downloads finished", "success");
        }
        updateQueue((prev) => prev.filter((item) => item.status === "pending"));
      }
    }
  }, [
    hfRepo,
    hfSelectedFile,
    hfTargetDir,
    recordCompletedDownload,
    refreshHfPartialDownload,
    updateQueue,
  ]);

  const enqueueHfDownload = useCallback(() => {
    if (!hfRepo.trim()) {
      showToast("Enter a Hugging Face repo", "error");
      return;
    }
    if (!hfSelectedFile) {
      showToast("Select a GGUF file", "error");
      return;
    }
    if (!hfTargetDir) {
      showToast("Select a model folder", "error");
      return;
    }

    const key = queueItemKey(hfRepo, hfSelectedFile, hfTargetDir);
    const duplicate = downloadQueueRef.current.some(
      (item) =>
        queueItemKey(item.repo, item.file_path, item.target_dir) === key &&
        (item.status === "pending" || item.status === "downloading"),
    );
    if (duplicate) {
      showToast("That download is already queued", "error");
      return;
    }

    const filename =
      hfFiles.find((file) => file.path === hfSelectedFile)?.filename ||
      hfSelectedFile.split("/").pop() ||
      hfSelectedFile;

    updateQueue((prev) => [
      ...prev,
      createQueueItem(hfRepo, hfSelectedFile, filename, hfTargetDir, hfToken.trim() || null),
    ]);
    showToast("Added to download queue", "success");
    void processDownloadQueue();
  }, [
    hfFiles,
    hfRepo,
    hfSelectedFile,
    hfTargetDir,
    hfToken,
    processDownloadQueue,
    showToast,
    updateQueue,
  ]);

  const removeQueuedDownload = useCallback(
    (id: string) => {
      updateQueue((prev) =>
        prev.filter((item) => !(item.id === id && item.status === "pending")),
      );
    },
    [updateQueue],
  );

  const clearFinishedQueue = useCallback(() => {
    updateQueue((prev) =>
      prev.filter((item) => item.status === "pending" || item.status === "downloading"),
    );
  }, [updateQueue]);

  const browseHfTargetDir = useCallback(async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select model download folder",
    });
    if (selected && typeof selected === "string") {
      setHfTargetDir(selected);
      if (!config.model_directories.some((dir) => samePath(dir, selected))) {
        const dirs = [...config.model_directories, selected];
        await saveAppConfig({ ...config, model_directories: dirs });
      }
    }
  }, [config, saveAppConfig]);

  const lookupHfFiles = useCallback(async () => {
    if (!hfRepo.trim()) {
      showToast("Enter a Hugging Face repo", "error");
      return;
    }
    try {
      setHfLoadingFiles(true);
      setHfFiles([]);
      setHfSelectedFile("");
      const files = (await invoke("list_hf_gguf_files", {
        repo: hfRepo.trim(),
        token: hfToken.trim() || null,
      })) as HfGgufFile[];
      setHfFiles(files);
      setHfSelectedFile(files[0]?.path ?? "");
      showToast(`Found ${files.length} GGUF files`, "success");
    } catch (error) {
      showToast(String(error), "error");
    } finally {
      setHfLoadingFiles(false);
    }
  }, [hfRepo, hfToken, showToast]);

  const cancelHfDownload = useCallback(async () => {
    try {
      await invoke("cancel_hf_download");
    } catch (error) {
      showToast(String(error), "error");
    }
  }, [showToast]);

  const discardHfPartial = useCallback(async () => {
    if (!hfSelectedFile || !hfTargetDir) return;
    try {
      await invoke("discard_hf_partial_download", {
        target_dir: hfTargetDir,
        file_path: hfSelectedFile,
      });
      setHfPartialDownload(null);
      setHfProgress(null);
      showToast("Partial download discarded", "success");
    } catch (error) {
      showToast(String(error), "error");
    }
  }, [hfSelectedFile, hfTargetDir, showToast]);

  const clearDownloadHistory = useCallback(() => {
    setDownloadHistory([]);
    saveDownloadHistory([]);
  }, []);

  const hfQueueActive = downloadQueue.some(
    (item) => item.status === "pending" || item.status === "downloading",
  );
  const canResume = Boolean(hfPartialDownload && !hfDownloading);

  return {
    hfRepo,
    setHfRepo,
    hfToken,
    setHfToken,
    hfFiles,
    hfSelectedFile,
    setHfSelectedFile,
    hfTargetDir,
    setHfTargetDir,
    hfLoadingFiles,
    hfDownloading,
    hfQueueActive,
    hfProgress,
    hfPartialDownload: canCheckPartial ? hfPartialDownload : null,
    downloadQueue,
    downloadHistory,
    browseHfTargetDir,
    lookupHfFiles,
    enqueueHfDownload,
    removeQueuedDownload,
    clearFinishedQueue,
    cancelHfDownload,
    discardHfPartial,
    clearDownloadHistory,
    canResume,
  };
}
