import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  AppConfig,
  LlamaCppBackendOption,
  LlamaCppUpdateInfo,
  LlamaCppUpdateProgress,
} from "../types";
import type { ToastType } from "./useToast";

interface UseLlamaCppUpdateOptions {
  exePath: string;
  setExePath: (path: string) => void;
  isServerRunning: boolean;
  buildCurrentConfig: (
    base?: AppConfig,
    overrides?: { exePath?: string } & Record<string, unknown>,
  ) => AppConfig;
  saveAppConfig: (cfg: AppConfig) => Promise<void>;
  showToast: (msg: string, type: ToastType) => void;
}

export function useLlamaCppUpdate({
  exePath,
  setExePath,
  isServerRunning,
  buildCurrentConfig,
  saveAppConfig,
  showToast,
}: UseLlamaCppUpdateOptions) {
  const [updateInfo, setUpdateInfo] = useState<LlamaCppUpdateInfo | null>(null);
  const [selectedBackend, setSelectedBackend] = useState("");
  const [checking, setChecking] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [progress, setProgress] = useState<LlamaCppUpdateProgress | null>(null);
  const selectedBackendRef = useRef(selectedBackend);

  useEffect(() => {
    selectedBackendRef.current = selectedBackend;
  }, [selectedBackend]);

  useEffect(() => {
    const unlisten = listen<LlamaCppUpdateProgress>("llama-cpp-update-progress", (event) => {
      setProgress(event.payload);
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  const applyUpdateInfo = useCallback((info: LlamaCppUpdateInfo) => {
    setUpdateInfo(info);
    setSelectedBackend(info.selected_backend);
  }, []);

  const checkForUpdate = useCallback(
    async (backendOverride?: string) => {
      if (!exePath) {
        showToast("Select llama-server first", "error");
        return null;
      }

      setChecking(true);
      setProgress(null);
      try {
        const info = await invoke<LlamaCppUpdateInfo>("get_llama_cpp_update_info", {
          exePath,
          backend: backendOverride || selectedBackendRef.current || null,
        });
        applyUpdateInfo(info);
        return info;
      } catch (error) {
        showToast(String(error), "error");
        return null;
      } finally {
        setChecking(false);
      }
    },
    [applyUpdateInfo, exePath, showToast],
  );

  useEffect(() => {
    if (!exePath) {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const info = await invoke<LlamaCppUpdateInfo>("get_llama_cpp_update_info", {
            exePath,
            backend: null,
          });
          if (!cancelled) {
            applyUpdateInfo(info);
          }
        } catch {
          // Silent on startup; user can refresh manually.
        }
      })();
    }, 4000);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [applyUpdateInfo, exePath]);

  const handleBackendChange = useCallback(
    async (backend: string) => {
      setSelectedBackend(backend);
      if (!exePath) return;
      try {
        const info = await invoke<LlamaCppUpdateInfo>("get_llama_cpp_update_info", {
          exePath,
          backend,
        });
        applyUpdateInfo(info);
        await saveAppConfig(
          buildCurrentConfig(undefined, {
            exePath,
            llamaCppBackend: backend,
          }),
        );
      } catch (error) {
        showToast(String(error), "error");
      }
    },
    [applyUpdateInfo, buildCurrentConfig, exePath, saveAppConfig, showToast],
  );

  const handleUpdate = useCallback(async () => {
    if (!exePath) {
      showToast("Select llama-server first", "error");
      return;
    }
    if (isServerRunning) {
      showToast("Stop llama-server before updating", "error");
      return;
    }
    const backend = selectedBackendRef.current || updateInfo?.selected_backend;
    if (!backend) {
      showToast("Choose a llama.cpp backend to install", "error");
      return;
    }

    setUpdating(true);
    setProgress({
      stage: "checking",
      filename: null,
      downloaded_bytes: 0,
      total_bytes: null,
      message: "Starting llama.cpp update...",
    });

    try {
      const info = await invoke<LlamaCppUpdateInfo>("update_llama_cpp", {
        exePath,
        backend,
      });
      applyUpdateInfo(info);
      const nextExe = `${info.install_dir.replace(/[\\/]+$/, "")}\\llama-server.exe`;
      setExePath(nextExe);
      await saveAppConfig(
        buildCurrentConfig(undefined, {
          exePath: nextExe,
          llamaCppBackend: backend,
          llamaCppTag: info.latest_tag,
        }),
      );
      showToast(`Updated llama.cpp to ${info.latest_tag}`, "success");
    } catch (error) {
      showToast(String(error), "error");
    } finally {
      setUpdating(false);
    }
  }, [
    applyUpdateInfo,
    buildCurrentConfig,
    exePath,
    isServerRunning,
    saveAppConfig,
    setExePath,
    showToast,
    updateInfo?.selected_backend,
  ]);

  const activeUpdateInfo = exePath ? updateInfo : null;
  const activeBackend = exePath ? selectedBackend : "";
  const backends: LlamaCppBackendOption[] = activeUpdateInfo?.backends ?? [];
  const updateAvailable = Boolean(activeUpdateInfo?.update_available);
  const canUpdate = Boolean(exePath && activeBackend && !isServerRunning && !updating);

  return {
    updateInfo: activeUpdateInfo,
    selectedBackend: activeBackend,
    backends,
    checking,
    updating,
    progress: exePath ? progress : null,
    updateAvailable,
    canUpdate,
    checkForUpdate,
    handleBackendChange,
    handleUpdate,
  };
}
