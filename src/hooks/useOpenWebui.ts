import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AppConfig, ServerSettings } from "../types";
import { appendBoundedLog } from "../utils/config";
import { deferAfterStartup, runWhenIdle } from "../utils/startup";
import type { ToastType } from "./useToast";
import type { ProcessStatus } from "./useLlamaServer";

interface UseOpenWebuiOptions {
  openWebuiVenvPath: string;
  openWebuiHost: string;
  openWebuiPort: number;
  serverSettings: ServerSettings;
  buildCurrentConfig: (base?: AppConfig) => AppConfig;
  saveAppConfig: (cfg: AppConfig) => Promise<void>;
  showToast: (msg: string, type: ToastType) => void;
}

export function useOpenWebui({
  openWebuiVenvPath,
  openWebuiHost,
  openWebuiPort,
  serverSettings,
  buildCurrentConfig,
  saveAppConfig,
  showToast,
}: UseOpenWebuiOptions) {
  const [openWebuiRunning, setOpenWebuiRunning] = useState(false);
  const [openWebuiStatus, setOpenWebuiStatus] = useState<ProcessStatus>("stopped");
  const [openWebuiLog, setOpenWebuiLog] = useState<string[]>([]);
  const [openWebuiLogExpanded, setOpenWebuiLogExpanded] = useState(false);
  const [openWebuiVersion, setOpenWebuiVersion] = useState<string | null>(null);
  const [openWebuiLatestVersion, setOpenWebuiLatestVersion] = useState<string | null>(null);
  const [openWebuiUpdating, setOpenWebuiUpdating] = useState(false);
  const openWebuiLogEndRef = useRef<HTMLDivElement>(null);
  const openWebuiHealthInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const openWebuiStartupDeadline = useRef<number | null>(null);
  const stoppingOpenWebui = useRef(false);

  useEffect(() => {
    const unlisten = listen<string>("open-webui-log", (event) => {
      setOpenWebuiLog((prev) => appendBoundedLog(prev, event.payload));
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    const unlisten = listen<string>("open-webui-exited", (event) => {
      setOpenWebuiRunning(false);
      openWebuiStartupDeadline.current = null;
      setOpenWebuiLog((prev) => appendBoundedLog(prev, `Process exited: ${event.payload}`));
      if (stoppingOpenWebui.current) {
        stoppingOpenWebui.current = false;
        setOpenWebuiStatus("stopped");
      } else {
        setOpenWebuiStatus("error");
        showToast("Open WebUI exited", "error");
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [showToast]);

  useEffect(() => {
    if (openWebuiLogExpanded && openWebuiLogEndRef.current) {
      openWebuiLogEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [openWebuiLog, openWebuiLogExpanded]);

  const refreshOpenWebuiVersions = useCallback(async (includeLatest = true) => {
    if (!openWebuiVenvPath) {
      setOpenWebuiVersion(null);
      setOpenWebuiLatestVersion(null);
      return;
    }

    try {
      const version = await invoke<string>("get_open_webui_version", {
        venvPath: openWebuiVenvPath,
      });
      setOpenWebuiVersion(version);
    } catch {
      setOpenWebuiVersion(null);
    }

    if (!includeLatest) {
      return;
    }

    try {
      const latest = await invoke<string>("get_open_webui_latest_version");
      setOpenWebuiLatestVersion(latest);
    } catch {
      setOpenWebuiLatestVersion(null);
    }
  }, [openWebuiVenvPath]);

  useEffect(() => {
    if (!openWebuiVenvPath) {
      setOpenWebuiVersion(null);
      setOpenWebuiLatestVersion(null);
      return;
    }

    let cancelled = false;
    const cancelInstalled = deferAfterStartup(() => {
      if (cancelled) {
        return;
      }
      void refreshOpenWebuiVersions(false);
    }, 800);
    const cancelLatest = runWhenIdle(() => {
      if (cancelled) {
        return;
      }
      void invoke<string>("get_open_webui_latest_version")
        .then((latest) => {
          if (!cancelled) {
            setOpenWebuiLatestVersion(latest);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setOpenWebuiLatestVersion(null);
          }
        });
    });

    return () => {
      cancelled = true;
      cancelInstalled();
      cancelLatest();
    };
  }, [openWebuiVenvPath, refreshOpenWebuiVersions]);

  useEffect(() => {
    if (openWebuiRunning) {
      if (openWebuiHealthInterval.current) {
        clearInterval(openWebuiHealthInterval.current);
      }
      const pollHealth = async () => {
        try {
          const status = await invoke("check_open_webui_health", {
            host: openWebuiHost,
            port: openWebuiPort,
          });
          setOpenWebuiStatus(status === "running" ? "running" : "error");
          openWebuiStartupDeadline.current = null;
        } catch {
          if (openWebuiStartupDeadline.current && Date.now() < openWebuiStartupDeadline.current) {
            setOpenWebuiStatus("starting");
          } else {
            setOpenWebuiStatus("error");
          }
        }
      };
      void pollHealth();
      openWebuiHealthInterval.current = setInterval(pollHealth, 3000);
    } else if (openWebuiHealthInterval.current) {
      clearInterval(openWebuiHealthInterval.current);
      openWebuiHealthInterval.current = null;
    }
    return () => {
      if (openWebuiHealthInterval.current) clearInterval(openWebuiHealthInterval.current);
    };
  }, [openWebuiRunning, openWebuiHost, openWebuiPort]);

  const handleStart = useCallback(async () => {
    if (!openWebuiVenvPath) {
      showToast("Please select the Open WebUI venv folder", "error");
      return;
    }

    setOpenWebuiStatus("starting");
    stoppingOpenWebui.current = false;
    setOpenWebuiLog([]);
    await saveAppConfig(buildCurrentConfig());

    try {
      const result = await invoke("start_open_webui", {
        config: {
          venv_path: openWebuiVenvPath,
          host: openWebuiHost,
          port: openWebuiPort,
          llama_host: serverSettings.host,
          llama_port: serverSettings.port,
        },
      });
      setOpenWebuiRunning(true);
      openWebuiStartupDeadline.current = Date.now() + 20000;
      setOpenWebuiStatus("starting");
      showToast(result as string, "success");
    } catch (error) {
      setOpenWebuiStatus("error");
      setOpenWebuiRunning(false);
      openWebuiStartupDeadline.current = null;
      showToast(String(error), "error");
      setOpenWebuiLog((prev) => appendBoundedLog(prev, String(error)));
    }
  }, [
    buildCurrentConfig,
    openWebuiHost,
    openWebuiPort,
    openWebuiVenvPath,
    saveAppConfig,
    serverSettings.host,
    serverSettings.port,
    showToast,
  ]);

  const handleStop = useCallback(async () => {
    try {
      stoppingOpenWebui.current = true;
      const result = await invoke("stop_open_webui");
      showToast(result as string, "success");
      setOpenWebuiRunning(false);
      setOpenWebuiStatus("stopped");
      openWebuiStartupDeadline.current = null;
    } catch (error) {
      stoppingOpenWebui.current = false;
      showToast(String(error), "error");
    }
  }, [showToast]);

  const handleUpdate = useCallback(async () => {
    if (!openWebuiVenvPath) {
      showToast("Please select the Open WebUI venv folder", "error");
      return;
    }

    setOpenWebuiUpdating(true);
    setOpenWebuiLog((prev) => appendBoundedLog(prev, "Starting Open WebUI update..."));

    try {
      const result = await invoke<string>("update_open_webui", {
        venvPath: openWebuiVenvPath,
      });
      showToast(result, "success");
      await refreshOpenWebuiVersions();
    } catch (error) {
      showToast(String(error), "error");
      setOpenWebuiLog((prev) => appendBoundedLog(prev, String(error)));
    } finally {
      setOpenWebuiUpdating(false);
    }
  }, [openWebuiVenvPath, refreshOpenWebuiVersions, showToast]);

  const clearOpenWebuiLog = useCallback(() => {
    void invoke("clear_open_webui_log");
    setOpenWebuiLog([]);
  }, []);

  const copyOpenWebuiEndpoint = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(`http://${openWebuiHost}:${openWebuiPort}`);
      showToast("Open WebUI URL copied", "success");
    } catch {
      showToast("Failed to copy URL", "error");
    }
  }, [openWebuiHost, openWebuiPort, showToast]);

  const openWebuiEndpoint = `http://${openWebuiHost}:${openWebuiPort}`;
  const updateAvailable = Boolean(
    openWebuiVersion && openWebuiLatestVersion && openWebuiVersion !== openWebuiLatestVersion,
  );
  const canStart = Boolean(
    openWebuiVenvPath && openWebuiStatus !== "starting" && !openWebuiUpdating,
  );

  return {
    openWebuiRunning,
    openWebuiStatus,
    openWebuiVersion,
    openWebuiLatestVersion,
    openWebuiUpdating,
    updateAvailable,
    openWebuiLog,
    openWebuiLogExpanded,
    setOpenWebuiLogExpanded,
    openWebuiLogEndRef,
    openWebuiEndpoint,
    canStart,
    handleStart,
    handleStop,
    handleUpdate,
    refreshOpenWebuiVersions,
    clearOpenWebuiLog,
    copyOpenWebuiEndpoint,
  };
}
