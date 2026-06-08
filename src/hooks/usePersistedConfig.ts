import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DEFAULT_THEME, isThemeId, type ThemeId } from "../themes";
import type { AppConfig, ModelInfo, ServerSettings } from "../types";
import {
  buildConfigSnapshot,
  defaultConfig,
  persistConfig,
  serverSettingsFromConfig,
} from "../utils/config";
import { deferAfterStartup } from "../utils/startup";

export function usePersistedConfig() {
  const [config, setConfig] = useState<AppConfig>(defaultConfig);
  const [theme, setTheme] = useState<ThemeId>(DEFAULT_THEME);
  const [exePath, setExePath] = useState("");
  const [modelPath, setModelPath] = useState("");
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [serverSettings, setServerSettings] = useState<ServerSettings>(() =>
    serverSettingsFromConfig(defaultConfig()),
  );
  const [openWebuiVenvPath, setOpenWebuiVenvPath] = useState("");
  const [openWebuiHost, setOpenWebuiHost] = useState("127.0.0.1");
  const [openWebuiPort, setOpenWebuiPort] = useState(3000);
  const configLoaded = useRef(false);

  const saveAppConfig = useCallback(async (cfg: AppConfig) => {
    try {
      await persistConfig(cfg);
      setConfig(cfg);
    } catch (error) {
      console.error("Failed to persist config:", error);
    }
  }, []);

  const buildCurrentConfig = useCallback(
    (base: AppConfig = config): AppConfig =>
      buildConfigSnapshot(base, {
        exePath,
        modelPath,
        theme,
        server: serverSettings,
        openWebui: {
          venvPath: openWebuiVenvPath,
          host: openWebuiHost,
          port: openWebuiPort,
        },
      }),
    [
      config,
      exePath,
      modelPath,
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

        if (workingConfig.model_directories?.length) {
          try {
            const found = (await invoke("scan_models", {
              directories: workingConfig.model_directories,
            })) as ModelInfo[];
            if (cancelled) {
              return;
            }
            setModels(found);
            if (!workingConfig.last_model && found.length > 0) {
              setModelPath(found[0].path);
              const updated = { ...workingConfig, last_model: found[0].path };
              workingConfig = updated;
              await saveAppConfig(updated);
            }
          } catch {
            // silent
          }
        }

        if (!workingConfig.exe_path) {
          try {
            const detected = (await invoke("auto_detect_server")) as string | null;
            if (detected && !cancelled) {
              setExePath(detected);
              await saveAppConfig({ ...workingConfig, exe_path: detected });
            }
          } catch {
            // silent
          }
        }

        if (!workingConfig.open_webui_venv_path) {
          try {
            const detected = (await invoke("auto_detect_open_webui_venv")) as string | null;
            if (detected && !cancelled) {
              setOpenWebuiVenvPath(detected);
              await saveAppConfig({ ...workingConfig, open_webui_venv_path: detected });
            }
          } catch {
            // silent
          }
        }
      }, 150);
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [saveAppConfig]);

  useEffect(() => {
    if (!configLoaded.current) return;
    const timer = window.setTimeout(() => {
      void saveAppConfig(buildCurrentConfig());
    }, 500);
    return () => window.clearTimeout(timer);
  }, [buildCurrentConfig, saveAppConfig]);

  return {
    config,
    setConfig,
    theme,
    setTheme,
    exePath,
    setExePath,
    modelPath,
    setModelPath,
    models,
    setModels,
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
