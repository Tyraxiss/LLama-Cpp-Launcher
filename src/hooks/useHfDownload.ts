import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  ModelScanResult,
} from "../types";
import {
  loadAutoDownloadMmproj,
  loadDownloadHistory,
  isMmprojFilename,
  samePath,
  saveAutoDownloadMmproj,
  saveDownloadHistory,
  suggestMmprojFromHfFiles,
  suggestMmprojPath,
} from "../utils/config";
import type { ToastType } from "./useToast";

interface UseHfDownloadOptions {
  buildCurrentConfig: (
    base?: AppConfig,
    overrides?: Parameters<typeof import("../utils/config").buildConfigSnapshot>[1] & {
      model_directories?: string[];
    },
  ) => AppConfig;
  saveAppConfig: (cfg: AppConfig) => Promise<void>;
  setModels: (models: ModelInfo[]) => void;
  setMmprojs: (mmprojs: ModelInfo[]) => void;
  setModelPath: (path: string) => void;
  setMmprojPath: (path: string) => void;
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
  buildCurrentConfig,
  saveAppConfig,
  setModels,
  setMmprojs,
  setModelPath,
  setMmprojPath,
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
  const [autoDownloadMmproj, setAutoDownloadMmprojState] = useState(loadAutoDownloadMmproj);

  const setAutoDownloadMmproj = useCallback((enabled: boolean) => {
    setAutoDownloadMmprojState(enabled);
    saveAutoDownloadMmproj(enabled);
  }, []);

  const matchedMmproj = useMemo(() => {
    if (!autoDownloadMmproj || !hfSelectedFile) return null;
    return suggestMmprojFromHfFiles(hfSelectedFile, hfFiles);
  }, [autoDownloadMmproj, hfFiles, hfSelectedFile]);

  const buildCurrentConfigRef = useRef(buildCurrentConfig);
  const saveAppConfigRef = useRef(saveAppConfig);
  const setModelsRef = useRef(setModels);
  const setMmprojsRef = useRef(setMmprojs);
  const setModelPathRef = useRef(setModelPath);
  const setMmprojPathRef = useRef(setMmprojPath);
  const showToastRef = useRef(showToast);
  const downloadQueueRef = useRef<HfDownloadQueueItem[]>([]);
  const queueProcessingRef = useRef(false);
  const hfFormRef = useRef({ repo: "", selectedFile: "", targetDir: "", token: "" });
  const processDownloadQueueRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    buildCurrentConfigRef.current = buildCurrentConfig;
    saveAppConfigRef.current = saveAppConfig;
    setModelsRef.current = setModels;
    setMmprojsRef.current = setMmprojs;
    setModelPathRef.current = setModelPath;
    setMmprojPathRef.current = setMmprojPath;
    showToastRef.current = showToast;
  }, [
    buildCurrentConfig,
    saveAppConfig,
    setModels,
    setMmprojs,
    setModelPath,
    setMmprojPath,
    showToast,
  ]);

  useEffect(() => {
    hfFormRef.current = {
      repo: hfRepo,
      selectedFile: hfSelectedFile,
      targetDir: hfTargetDir,
      token: hfToken,
    };
  }, [hfRepo, hfSelectedFile, hfTargetDir, hfToken]);

  const syncQueue = useCallback(
    (updater: (prev: HfDownloadQueueItem[]) => HfDownloadQueueItem[]) => {
      const next = updater(downloadQueueRef.current);
      downloadQueueRef.current = next;
      setDownloadQueue(next);
      return next;
    },
    [],
  );

  const kickDownloadQueue = useCallback(() => {
    queueMicrotask(() => {
      void processDownloadQueueRef.current();
    });
  }, []);

  useEffect(() => {
    let lastEmit = 0;
    let pending: HfDownloadProgress | null = null;
    let flushTimer: number | null = null;

    const flush = () => {
      if (!pending) return;
      setHfProgress(pending);
      pending = null;
      flushTimer = null;
    };

    const unlisten = listen<HfDownloadProgress>("hf-download-progress", (event) => {
      const payload = event.payload;
      if (payload.status === "downloading") {
        setHfDownloading(true);
        const now = Date.now();
        pending = payload;
        if (now - lastEmit >= 250) {
          lastEmit = now;
          flush();
        } else if (flushTimer === null) {
          flushTimer = window.setTimeout(() => {
            lastEmit = Date.now();
            flush();
          }, 250);
        }
        return;
      }

      if (flushTimer !== null) {
        window.clearTimeout(flushTimer);
        flushTimer = null;
      }
      pending = null;
      setHfProgress(payload);
      if (["complete", "cancelled", "error"].includes(payload.status)) {
        setHfDownloading(false);
      }
    });
    return () => {
      if (flushTimer !== null) window.clearTimeout(flushTimer);
      void unlisten.then((fn) => fn());
    };
  }, []);

  const refreshPartialForItem = useCallback(async (item: HfDownloadQueueItem) => {
    try {
      const partial = (await invoke("get_hf_partial_download", {
        repo: item.repo,
        filePath: item.file_path,
        targetDir: item.target_dir,
        token: item.token,
      })) as HfPartialDownload | null;
      const form = hfFormRef.current;
      if (
        queueItemKey(form.repo, form.selectedFile, form.targetDir) ===
        queueItemKey(item.repo, item.file_path, item.target_dir)
      ) {
        setHfPartialDownload(partial);
      }
      return partial;
    } catch {
      return null;
    }
  }, []);

  const refreshHfPartialDownload = useCallback(async () => {
    const { repo, selectedFile, targetDir, token } = hfFormRef.current;
    if (!repo.trim() || !selectedFile || !targetDir) {
      return;
    }
    try {
      const partial = (await invoke("get_hf_partial_download", {
        repo: repo.trim(),
        filePath: selectedFile,
        targetDir: targetDir,
        token: token.trim() || null,
      })) as HfPartialDownload | null;
      setHfPartialDownload(partial);
    } catch {
      setHfPartialDownload(null);
    }
  }, []);

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
          filePath: hfSelectedFile,
          targetDir: hfTargetDir,
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
    async (item: HfDownloadQueueItem, downloadedPath: string, rescan: boolean) => {
      const cfg = buildCurrentConfigRef.current();
      const dirs = cfg.model_directories.some((dir) => samePath(dir, item.target_dir))
        ? cfg.model_directories
        : [...cfg.model_directories, item.target_dir];

      let scanMmprojs = [] as ModelInfo[];
      if (rescan) {
        const scan = (await invoke("scan_models", { directories: dirs })) as ModelScanResult;
        scanMmprojs = scan.mmprojs;
        setModelsRef.current(scan.models);
        setMmprojsRef.current(scan.mmprojs);
      }

      const downloadedName = downloadedPath.split(/[/\\]/).pop() || downloadedPath;
      const isMmproj = isMmprojFilename(downloadedName);
      let nextModel = cfg.last_model;
      let nextMmproj = cfg.last_mmproj;

      if (!isMmproj) {
        nextModel = downloadedPath;
        setModelPathRef.current(downloadedPath);
        if (rescan) {
          nextMmproj = suggestMmprojPath(downloadedPath, scanMmprojs);
          setMmprojPathRef.current(nextMmproj ?? "");
        }
      } else if (cfg.last_model) {
        if (rescan) {
          const suggested = suggestMmprojPath(cfg.last_model, scanMmprojs);
          if (suggested === downloadedPath) {
            nextMmproj = downloadedPath;
            setMmprojPathRef.current(downloadedPath);
          }
        } else {
          nextMmproj = downloadedPath;
          setMmprojPathRef.current(downloadedPath);
        }
      }

      await saveAppConfigRef.current(
        buildCurrentConfigRef.current(undefined, {
          model_directories: dirs,
          modelPath: nextModel ?? undefined,
          mmprojPath: nextMmproj ?? null,
        }),
      );

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

    const hasPending = downloadQueueRef.current.some((item) => item.status === "pending");
    if (!hasPending) {
      return;
    }

    queueProcessingRef.current = true;

    try {
      while (true) {
        const next = downloadQueueRef.current.find((item) => item.status === "pending");
        if (!next) {
          break;
        }

        syncQueue((prev) =>
          prev.map((item) =>
            item.id === next.id ? { ...item, status: "downloading" as const } : item,
          ),
        );
        setHfDownloading(true);
        setHfProgress(null);

        const form = hfFormRef.current;

        try {
          const downloadedPath = (await invoke("download_hf_model", {
            config: {
              repo: next.repo,
              file_path: next.file_path,
              target_dir: next.target_dir,
              token: next.token,
            },
          })) as string;

          syncQueue((prev) =>
            prev.map((item) =>
              item.id === next.id
                ? { ...item, status: "complete" as const, result_path: downloadedPath }
                : item,
            ),
          );

          try {
            await recordCompletedDownload(next, downloadedPath, false);
          } catch (error) {
            showToastRef.current(
              `Downloaded but failed to update model library: ${String(error)}`,
              "error",
            );
          }

          if (
            queueItemKey(form.repo, form.selectedFile, form.targetDir) ===
            queueItemKey(next.repo, next.file_path, next.target_dir)
          ) {
            setHfPartialDownload(null);
          }
        } catch (error) {
          const message = String(error);
          if (message === "Download cancelled") {
            syncQueue((prev) =>
              prev.map((item) =>
                item.id === next.id ? { ...item, status: "cancelled" as const } : item,
              ),
            );
            if (
              form.repo.trim() === next.repo &&
              form.selectedFile === next.file_path &&
              samePath(form.targetDir, next.target_dir)
            ) {
              await refreshHfPartialDownload();
            } else {
              await refreshPartialForItem(next);
            }
            continue;
          }

          syncQueue((prev) =>
            prev.map((item) =>
              item.id === next.id ? { ...item, status: "error" as const, error: message } : item,
            ),
          );
          showToastRef.current(message, "error");
          if (
            form.repo.trim() === next.repo &&
            form.selectedFile === next.file_path &&
            samePath(form.targetDir, next.target_dir)
          ) {
            await refreshHfPartialDownload();
          } else {
            await refreshPartialForItem(next);
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
          try {
            const cfg = buildCurrentConfigRef.current();
            if (cfg.model_directories.length > 0) {
              const scan = (await invoke("scan_models", {
                directories: cfg.model_directories,
              })) as ModelScanResult;
              setModelsRef.current(scan.models);
              setMmprojsRef.current(scan.mmprojs);
              if (cfg.last_model) {
                const suggested = suggestMmprojPath(cfg.last_model, scan.mmprojs);
                if (suggested && suggested !== cfg.last_mmproj) {
                  setMmprojPathRef.current(suggested);
                  await saveAppConfigRef.current(
                    buildCurrentConfigRef.current(undefined, { mmprojPath: suggested }),
                  );
                }
              }
            }
          } catch {
            // Scan after queue is best-effort.
          }
          showToastRef.current("Queued downloads finished", "success");
        }
        syncQueue((prev) => prev.filter((item) => item.status !== "complete"));
      }
    }
  }, [recordCompletedDownload, refreshHfPartialDownload, refreshPartialForItem, syncQueue]);

  useEffect(() => {
    processDownloadQueueRef.current = processDownloadQueue;
  }, [processDownloadQueue]);

  const pendingCount = downloadQueue.filter((item) => item.status === "pending").length;

  useEffect(() => {
    if (pendingCount > 0 && !queueProcessingRef.current) {
      kickDownloadQueue();
    }
  }, [pendingCount, kickDownloadQueue]);

  const retryQueuedDownload = useCallback(
    (id: string) => {
      const item = downloadQueueRef.current.find((entry) => entry.id === id);
      if (!item || (item.status !== "error" && item.status !== "cancelled")) {
        return;
      }

      syncQueue((prev) =>
        prev.map((entry) =>
          entry.id === id ? { ...entry, status: "pending" as const, error: undefined } : entry,
        ),
      );
      void refreshPartialForItem(item);
      kickDownloadQueue();
    },
    [kickDownloadQueue, refreshPartialForItem, syncQueue],
  );

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

    const retriable = downloadQueueRef.current.find(
      (item) =>
        queueItemKey(item.repo, item.file_path, item.target_dir) === key &&
        (item.status === "error" || item.status === "cancelled"),
    );
    if (retriable) {
      syncQueue((prev) =>
        prev.map((item) =>
          item.id === retriable.id
            ? { ...item, status: "pending" as const, error: undefined }
            : item,
        ),
      );
      showToast("Resuming download", "success");
      kickDownloadQueue();
      return;
    }

    const filename =
      hfFiles.find((file) => file.path === hfSelectedFile)?.filename ||
      hfSelectedFile.split("/").pop() ||
      hfSelectedFile;

    const token = hfToken.trim() || null;
    const itemsToAdd = [createQueueItem(hfRepo, hfSelectedFile, filename, hfTargetDir, token)];

    if (autoDownloadMmproj && !isMmprojFilename(filename)) {
      const mmproj = suggestMmprojFromHfFiles(hfSelectedFile, hfFiles);
      if (mmproj) {
        const mmprojKey = queueItemKey(hfRepo, mmproj.path, hfTargetDir);
        const alreadyQueued = downloadQueueRef.current.some(
          (item) =>
            queueItemKey(item.repo, item.file_path, item.target_dir) === mmprojKey &&
            (item.status === "pending" ||
              item.status === "downloading" ||
              item.status === "complete"),
        );
        const alreadyAdding = itemsToAdd.some(
          (item) => queueItemKey(item.repo, item.file_path, item.target_dir) === mmprojKey,
        );
        if (!alreadyQueued && !alreadyAdding) {
          itemsToAdd.push(
            createQueueItem(hfRepo, mmproj.path, mmproj.filename, hfTargetDir, token),
          );
        }
      }
    }

    syncQueue((prev) => [...prev, ...itemsToAdd]);
    showToast(
      itemsToAdd.length > 1
        ? `Queued model + mmproj (${itemsToAdd[1]?.filename})`
        : "Added to download queue",
      "success",
    );
    kickDownloadQueue();
  }, [
    autoDownloadMmproj,
    hfFiles,
    hfRepo,
    hfSelectedFile,
    hfTargetDir,
    hfToken,
    kickDownloadQueue,
    showToast,
    syncQueue,
  ]);

  const removeQueuedDownload = useCallback(
    (id: string) => {
      syncQueue((prev) => prev.filter((item) => !(item.id === id && item.status === "pending")));
    },
    [syncQueue],
  );

  const clearFinishedQueue = useCallback(() => {
    syncQueue((prev) => prev.filter((item) => item.status !== "complete"));
  }, [syncQueue]);

  const browseHfTargetDir = useCallback(async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select model download folder",
    });
    if (selected && typeof selected === "string") {
      setHfTargetDir(selected);
      const cfg = buildCurrentConfigRef.current();
      if (!cfg.model_directories.some((dir) => samePath(dir, selected))) {
        const dirs = [...cfg.model_directories, selected];
        await saveAppConfigRef.current(
          buildCurrentConfigRef.current(undefined, { model_directories: dirs }),
        );
      }
    }
  }, []);

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
        targetDir: hfTargetDir,
        filePath: hfSelectedFile,
        repo: hfRepo.trim() || null,
      });
      setHfPartialDownload(null);
      setHfProgress(null);
      showToast("Partial download discarded", "success");
    } catch (error) {
      showToast(String(error), "error");
    }
  }, [hfRepo, hfSelectedFile, hfTargetDir, showToast]);

  const clearDownloadHistory = useCallback(() => {
    setDownloadHistory([]);
    saveDownloadHistory([]);
  }, []);

  const hfQueueActive = downloadQueue.some(
    (item) => item.status === "pending" || item.status === "downloading",
  );
  const currentSelectionKey = canCheckPartial
    ? queueItemKey(hfRepo, hfSelectedFile, hfTargetDir)
    : "";
  const hasRetriableInQueue = downloadQueue.some(
    (item) =>
      (item.status === "error" || item.status === "cancelled") &&
      (!currentSelectionKey ||
        queueItemKey(item.repo, item.file_path, item.target_dir) === currentSelectionKey),
  );
  const canResume = Boolean((hfPartialDownload || hasRetriableInQueue) && !hfDownloading);

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
    autoDownloadMmproj,
    setAutoDownloadMmproj,
    matchedMmproj,
    browseHfTargetDir,
    lookupHfFiles,
    enqueueHfDownload,
    removeQueuedDownload,
    clearFinishedQueue,
    retryQueuedDownload,
    cancelHfDownload,
    discardHfPartial,
    clearDownloadHistory,
    canResume,
  };
}
