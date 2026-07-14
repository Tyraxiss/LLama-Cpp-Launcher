import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DEFAULT_THEME, isThemeId, type ThemeId } from "../themes";
import type {
  AppConfig,
  ModelInfo,
  ModelScanResult,
  OpenWebuiSettings,
  ServerSettings,
} from "../types";
import {
  buildConfigSnapshot,
  defaultConfig,
  persistConfig,
  serverSettingsFromConfig,
  suggestMmprojPath,
} from "../utils/config";
import { deferAfterStartup } from "../utils/startup";

type BuildConfigOverrides = Omit<Parameters<typeof buildConfigSnapshot>[1], "openWebui"> & {
  model_directories?: string[];
  openWebui?: Partial<OpenWebuiSettings>;
};

interface UsePersistedConfigOptions {
  onSaveError?: (error: unknown) => void;
}

export function usePersistedConfig({ onSaveError }: UsePersistedConfigOptions = {}) {
  const [config, setConfig] = useState<AppConfig>(defaultConfig);
  const [theme, setTheme] = useState<ThemeId>(DEFAULT_THEME);
  const [exePath, setExePath] = useState("");
  const [modelPath, setModelPath] = useState("");
  const [mmprojPath, setMmprojPath] = useState("");
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [mmprojs, setMmprojs] = useState<ModelInfo[]>([]);
  const [serverSettings, setServerSettings] = useState<ServerSettings>(() =>
    serverSettingsFromConfig(defaultConfig()),
  );
  const [openWebuiVenvPath, setOpenWebuiVenvPath] = useState("");
  const [openWebuiHost, setOpenWebuiHost] = useState("127.0.0.1");
  const [openWebuiPort, setOpenWebuiPort] = useState(3000);
  const [bootstrapComplete, setBootstrapComplete] = useState(false);
  const configLoaded = useRef(false);
  const onSaveErrorRef = useRef(onSaveError);
  const liveStateRef = useRef({
    exePath: "",
    modelPath: "",
    mmprojPath: "",
    theme: DEFAULT_THEME as ThemeId,
    openWebuiVenvPath: "",
    openWebuiHost: "127.0.0.1",
    openWebuiPort: 3000,
  });

  useEffect(() => {
    onSaveErrorRef.current = onSaveError;
  }, [onSaveError]);

  useEffect(() => {
    liveStateRef.current = {
      exePath,
      modelPath,
      mmprojPath,
      theme,
      openWebuiVenvPath,
      openWebuiHost,
      openWebuiPort,
    };
  }, [exePath, modelPath, mmprojPath, theme, openWebuiVenvPath, openWebuiHost, openWebuiPort]);

  const saveAppConfig = useCallback(async (cfg: AppConfig) => {
    try {
      await persistConfig(cfg);
      setConfig(cfg);
    } catch (error) {
      console.error("Failed to persist config:", error);
      onSaveErrorRef.current?.(error);
    }
  }, []);

  const buildCurrentConfig = useCallback(
    (base: AppConfig = config, overrides?: BuildConfigOverrides): AppConfig => {
      const {
        model_directories,
        openWebui: openWebuiOverride,
        ...snapshotOverrides
      } = overrides ?? {};
      const snapshot = buildConfigSnapshot(base, {
        exePath,
        modelPath,
        mmprojPath: mmprojPath || null,
        theme,
        server: serverSettings,
        openWebui: openWebuiOverride
          ? {
              venvPath: openWebuiOverride.venvPath ?? openWebuiVenvPath,
              host: openWebuiOverride.host ?? openWebuiHost,
              port: openWebuiOverride.port ?? openWebuiPort,
            }
          : {
              venvPath: openWebuiVenvPath,
              host: openWebuiHost,
              port: openWebuiPort,
            },
        ...snapshotOverrides,
      });
      return model_directories ? { ...snapshot, model_directories } : snapshot;
    },
    [
      config,
      exePath,
      modelPath,
      mmprojPath,
      theme,
      serverSettings,
      openWebuiVenvPath,
      openWebuiHost,
      openWebuiPort,
    ],
  );

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      let cfg: AppConfig = defaultConfig();

      try {
        cfg = (await invoke("load_config")) as AppConfig;
        if (cancelled) {
          return;
        }

        setConfig(cfg);
        const savedTheme = isThemeId(cfg.last_theme) ? cfg.last_theme : DEFAULT_THEME;
        setTheme(savedTheme);

        if (cfg.exe_path) setExePath(cfg.exe_path);
        if (cfg.last_model) setModelPath(cfg.last_model);
        if (cfg.last_mmproj) setMmprojPath(cfg.last_mmproj);
        setServerSettings(serverSettingsFromConfig(cfg));
        if (cfg.open_webui_venv_path) setOpenWebuiVenvPath(cfg.open_webui_venv_path);
        setOpenWebuiPort(cfg.last_open_webui_port ?? 3000);
        setOpenWebuiHost(cfg.last_open_webui_host ?? "127.0.0.1");
      } catch {
        // Use defaults
      }

      configLoaded.current = true;

      deferAfterStartup(async () => {
        if (cancelled) {
          return;
        }

        let workingConfig = cfg;
        const mergeLive = (base: AppConfig): AppConfig => {
          const live = liveStateRef.current;
          return {
            ...base,
            exe_path: live.exePath || base.exe_path,
            last_model: live.modelPath || base.last_model,
            last_mmproj: live.mmprojPath ? live.mmprojPath : base.last_mmproj,
            last_theme: live.theme || base.last_theme,
            open_webui_venv_path: live.openWebuiVenvPath || base.open_webui_venv_path,
            last_open_webui_host: live.openWebuiHost || base.last_open_webui_host,
            last_open_webui_port: live.openWebuiPort || base.last_open_webui_port,
          };
        };

        if (workingConfig.model_directories?.length) {
          try {
            const scan = (await invoke("scan_models", {
              directories: workingConfig.model_directories,
            })) as ModelScanResult;
            if (cancelled) {
              return;
            }
            setModels(scan.models);
            setMmprojs(scan.mmprojs);

            // Prefer values the user may already have changed during the scan.
            const live = liveStateRef.current;
            let nextModel = live.modelPath || workingConfig.last_model;
            if (!nextModel && scan.models.length > 0) {
              nextModel = scan.models[0].path;
              setModelPath(nextModel);
            }

            let nextMmproj = live.mmprojPath || workingConfig.last_mmproj;
            if (nextModel && !live.mmprojPath) {
              if (nextMmproj) {
                const savedStillValid = scan.mmprojs.some((entry) => entry.path === nextMmproj);
                if (!savedStillValid) {
                  nextMmproj = suggestMmprojPath(nextModel, scan.mmprojs);
                  setMmprojPath(nextMmproj ?? "");
                }
              } else if (!workingConfig.last_model) {
                nextMmproj = suggestMmprojPath(nextModel, scan.mmprojs);
                setMmprojPath(nextMmproj ?? "");
              }
            }

            if (
              nextModel !== workingConfig.last_model ||
              nextMmproj !== workingConfig.last_mmproj
            ) {
              const updated = mergeLive({
                ...workingConfig,
                last_model: nextModel,
                last_mmproj: nextMmproj ?? null,
              });
              workingConfig = updated;
              await saveAppConfig(updated);
            }
          } catch {
            // silent
          }
        }

        if (!liveStateRef.current.exePath && !workingConfig.exe_path) {
          try {
            const detected = (await invoke("auto_detect_server")) as string | null;
            if (detected && !cancelled && !liveStateRef.current.exePath) {
              setExePath(detected);
              workingConfig = mergeLive({ ...workingConfig, exe_path: detected });
              await saveAppConfig(workingConfig);
            }
          } catch {
            // silent
          }
        }

        if (!liveStateRef.current.openWebuiVenvPath && !workingConfig.open_webui_venv_path) {
          try {
            const detected = (await invoke("auto_detect_open_webui_venv")) as string | null;
            if (detected && !cancelled && !liveStateRef.current.openWebuiVenvPath) {
              setOpenWebuiVenvPath(detected);
              workingConfig = mergeLive({
                ...workingConfig,
                open_webui_venv_path: detected,
              });
              await saveAppConfig(workingConfig);
            }
          } catch {
            // silent
          }
        }

        if (!cancelled) {
          setBootstrapComplete(true);
        }
      }, 150);
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [saveAppConfig]);

  useEffect(() => {
    if (!configLoaded.current || !bootstrapComplete) return;
    const timer = window.setTimeout(() => {
      void saveAppConfig(buildCurrentConfig());
    }, 500);
    return () => window.clearTimeout(timer);
  }, [bootstrapComplete, buildCurrentConfig, saveAppConfig]);

  return {
    config,
    setConfig,
    theme,
    setTheme,
    exePath,
    setExePath,
    modelPath,
    setModelPath,
    mmprojPath,
    setMmprojPath,
    models,
    setModels,
    mmprojs,
    setMmprojs,
    serverSettings,
    setServerSettings,
    openWebuiVenvPath,
    setOpenWebuiVenvPath,
    openWebuiHost,
    setOpenWebuiHost,
    openWebuiPort,
    setOpenWebuiPort,
    saveAppConfig,
    buildCurrentConfig,
  };
}
