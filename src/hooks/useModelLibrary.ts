import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { AppConfig, ModelInfo } from "../types";
import { samePath } from "../utils/config";
import type { ToastType } from "./useToast";

interface UseModelLibraryOptions {
  config: AppConfig;
  saveAppConfig: (cfg: AppConfig) => Promise<void>;
  setModels: (models: ModelInfo[]) => void;
  setModelPath: (path: string) => void;
  hfTargetDir: string;
  setHfTargetDir: (dir: string) => void;
  showToast: (msg: string, type: ToastType) => void;
}

export function useModelLibrary({
  config,
  saveAppConfig,
  setModels,
  setModelPath,
  hfTargetDir,
  setHfTargetDir,
  showToast,
}: UseModelLibraryOptions) {
  const [scanInProgress, setScanInProgress] = useState(false);

  const rescanModels = useCallback(async () => {
    if (!config.model_directories.length) return;
    try {
      setScanInProgress(true);
      const found = (await invoke("scan_models", {
        directories: config.model_directories,
      })) as ModelInfo[];
      setModels(found);
      showToast(`Found ${found.length} models`, "success");
    } catch {
      showToast("Failed to scan for models", "error");
    } finally {
      setScanInProgress(false);
    }
  }, [config.model_directories, setModels, showToast]);

  const addModelDirectory = useCallback(async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select model directory to scan",
    });
    if (selected && typeof selected === "string") {
      if (config.model_directories.some((dir) => samePath(dir, selected))) return;
      const dirs = [...config.model_directories, selected];
      await saveAppConfig({ ...config, model_directories: dirs });
      try {
        setScanInProgress(true);
        const found = (await invoke("scan_models", { directories: dirs })) as ModelInfo[];
        setModels(found);
      } catch {
        showToast("Failed to scan directory", "error");
      } finally {
        setScanInProgress(false);
      }
    }
  }, [config, saveAppConfig, setModels, showToast]);

  const removeModelDirectory = useCallback(
    async (dir: string) => {
      const dirs = config.model_directories.filter((d) => d !== dir);
      await saveAppConfig({ ...config, model_directories: dirs });
      if (samePath(hfTargetDir, dir)) {
        setHfTargetDir(dirs[0] ?? "");
      }
      try {
        setScanInProgress(true);
        const found = (await invoke("scan_models", { directories: dirs })) as ModelInfo[];
        setModels(found);
      } catch {
        // silent
      } finally {
        setScanInProgress(false);
      }
    },
    [config, hfTargetDir, saveAppConfig, setHfTargetDir, setModels],
  );

  const pickModel = useCallback(async () => {
    const selected = await open({
      multiple: false,
      title: "Select model file",
      filters: [{ name: "GGUF Model", extensions: ["gguf"] }],
    });
    if (selected && typeof selected === "string") {
      setModelPath(selected);
      await saveAppConfig({ ...config, last_model: selected });
    }
  }, [config, saveAppConfig, setModelPath]);

  const handleModelSelect = useCallback(
    async (path: string) => {
      setModelPath(path);
      await saveAppConfig({ ...config, last_model: path });
    },
    [config, saveAppConfig, setModelPath],
  );

  useEffect(() => {
    if (!hfTargetDir && config.model_directories.length > 0) {
      setHfTargetDir(config.model_directories[0]);
    }
  }, [config.model_directories, hfTargetDir, setHfTargetDir]);

  return {
    scanInProgress,
    rescanModels,
    addModelDirectory,
    removeModelDirectory,
    pickModel,
    handleModelSelect,
  };
}
