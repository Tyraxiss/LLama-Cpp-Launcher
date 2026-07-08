import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { AppConfig, ModelInfo, ModelScanResult } from "../types";
import { isMmprojFilename, samePath, suggestMmprojPath } from "../utils/config";
import type { ToastType } from "./useToast";

interface UseModelLibraryOptions {
  config: AppConfig;
  mmprojs: ModelInfo[];
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
  hfTargetDir: string;
  setHfTargetDir: (dir: string) => void;
  showToast: (msg: string, type: ToastType) => void;
}

async function scanModelLibrary(directories: string[]): Promise<ModelScanResult> {
  return (await invoke("scan_models", { directories })) as ModelScanResult;
}

export function useModelLibrary({
  config,
  mmprojs,
  buildCurrentConfig,
  saveAppConfig,
  setModels,
  setMmprojs,
  setModelPath,
  setMmprojPath,
  hfTargetDir,
  setHfTargetDir,
  showToast,
}: UseModelLibraryOptions) {
  const [scanInProgress, setScanInProgress] = useState(false);

  const applyScanResult = useCallback(
    (scan: ModelScanResult) => {
      setModels(scan.models);
      setMmprojs(scan.mmprojs);
    },
    [setModels, setMmprojs],
  );

  const syncMmprojForModel = useCallback(
    async (path: string, mmprojList: ModelInfo[]) => {
      const nextMmproj = suggestMmprojPath(path, mmprojList);
      setMmprojPath(nextMmproj ?? "");
      await saveAppConfig(
        buildCurrentConfig(undefined, {
          modelPath: path,
          mmprojPath: nextMmproj ?? null,
        }),
      );
    },
    [buildCurrentConfig, saveAppConfig, setMmprojPath],
  );

  const rescanModels = useCallback(async () => {
    if (!config.model_directories.length) return;
    try {
      setScanInProgress(true);
      const scan = await scanModelLibrary(config.model_directories);
      applyScanResult(scan);
      showToast(`Found ${scan.models.length} models, ${scan.mmprojs.length} mmproj`, "success");
    } catch {
      showToast("Failed to scan for models", "error");
    } finally {
      setScanInProgress(false);
    }
  }, [applyScanResult, config.model_directories, showToast]);

  const addModelDirectory = useCallback(async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select model directory to scan",
    });
    if (selected && typeof selected === "string") {
      if (config.model_directories.some((dir) => samePath(dir, selected))) return;
      const dirs = [...config.model_directories, selected];
      await saveAppConfig(buildCurrentConfig(undefined, { model_directories: dirs }));
      try {
        setScanInProgress(true);
        const scan = await scanModelLibrary(dirs);
        applyScanResult(scan);
      } catch {
        showToast("Failed to scan directory", "error");
      } finally {
        setScanInProgress(false);
      }
    }
  }, [applyScanResult, buildCurrentConfig, config.model_directories, saveAppConfig, showToast]);

  const removeModelDirectory = useCallback(
    async (dir: string) => {
      const dirs = config.model_directories.filter((d) => !samePath(d, dir));
      await saveAppConfig(buildCurrentConfig(undefined, { model_directories: dirs }));
      if (samePath(hfTargetDir, dir)) {
        setHfTargetDir(dirs[0] ?? "");
      }
      try {
        setScanInProgress(true);
        const scan = await scanModelLibrary(dirs);
        applyScanResult(scan);
      } catch {
        // silent
      } finally {
        setScanInProgress(false);
      }
    },
    [
      applyScanResult,
      buildCurrentConfig,
      config.model_directories,
      hfTargetDir,
      saveAppConfig,
      setHfTargetDir,
    ],
  );

  const pickModel = useCallback(async () => {
    const selected = await open({
      multiple: false,
      title: "Select model file",
      filters: [{ name: "GGUF Model", extensions: ["gguf"] }],
    });
    if (selected && typeof selected === "string") {
      if (isMmprojFilename(selected.split(/[/\\]/).pop() ?? "")) {
        showToast(
          "That file looks like an mmproj projector. Pick the main model instead.",
          "error",
        );
        return;
      }
      setModelPath(selected);
      await syncMmprojForModel(selected, mmprojs);
    }
  }, [mmprojs, setModelPath, showToast, syncMmprojForModel]);

  const pickMmproj = useCallback(async () => {
    const selected = await open({
      multiple: false,
      title: "Select mmproj file",
      filters: [{ name: "GGUF Projector", extensions: ["gguf"] }],
    });
    if (selected && typeof selected === "string") {
      setMmprojPath(selected);
      await saveAppConfig(buildCurrentConfig(undefined, { mmprojPath: selected }));
    }
  }, [buildCurrentConfig, saveAppConfig, setMmprojPath]);

  const handleModelSelect = useCallback(
    async (path: string) => {
      setModelPath(path);
      await syncMmprojForModel(path, mmprojs);
    },
    [mmprojs, setModelPath, syncMmprojForModel],
  );

  const handleMmprojSelect = useCallback(
    async (path: string) => {
      setMmprojPath(path);
      await saveAppConfig(buildCurrentConfig(undefined, { mmprojPath: path || null }));
    },
    [buildCurrentConfig, saveAppConfig, setMmprojPath],
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
    pickMmproj,
    handleModelSelect,
    handleMmprojSelect,
  };
}
