import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AppConfig, OpenWebuiSettings, ServerSettings } from "../types";
import { appendBoundedLog } from "../utils/config";
import { deferAfterStartup, runWhenIdle } from "../utils/startup";
import type { ToastType } from "./useToast";
import type { ProcessStatus } from "./useLlamaServer";

interface UseOpenWebuiOptions {
  exePath: string;
  openWebuiVenvPath: string;
  setOpenWebuiVenvPath: (path: string) => void;
  venvParentPath: string;
  openWebuiHost: string;
  openWebuiPort: number;
  serverSettings: ServerSettings;
  isLlamaRunning: boolean;
  buildCurrentConfig: (
    base?: AppConfig,
    overrides?: { openWebui?: Partial<OpenWebuiSettings> },
  ) => AppConfig;
  saveAppConfig: (cfg: AppConfig) => Promise<void>;
  showToast: (msg: string, type: ToastType) => void;
}

export function useOpenWebui({
  exePath,
  openWebuiVenvPath,
  setOpenWebuiVenvPath,
  venvParentPath,
  openWebuiHost,
  openWebuiPort,
  serverSettings,
  isLlamaRunning,
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
  const [openWebuiSettingUp, setOpenWebuiSettingUp] = useState(false);
  const openWebuiLogEndRef = useRef<HTMLDivElement>(null);
  const openWebuiHealthInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const openWebuiHealthPollSeq = useRef(0);
  const openWebuiStartupDeadline = useRef<number | null>(null);
  const stoppingOpenWebui = useRef(false);
  const userStoppedRef = useRef(false);
  const healthInFlight = useRef(false);
  const openWebuiRunningRef = useRef(false);
  const openWebuiSettingsRef = useRef({ host: openWebuiHost, port: openWebuiPort });

  useEffect(() => {
    openWebuiSettingsRef.current = { host: openWebuiHost, port: openWebuiPort };
  }, [openWebuiHost, openWebuiPort]);

  useEffect(() => {
    openWebuiRunningRef.current = openWebuiRunning;
  }, [openWebuiRunning]);

  useEffect(() => {
    const unlisten = listen<string>("open-webui-log", (event) => {
      setOpenWebuiLog((prev) => appendBoundedLog(prev, event.payload));
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    const unlisten = listen<string>("open-webui-setup-progress", (event) => {
      setOpenWebuiLog((prev) => appendBoundedLog(prev, event.payload));
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    const unlisten = listen<string>("open-webui-exited", (event) => {
      void (async () => {
        setOpenWebuiLog((prev) => appendBoundedLog(prev, `Process handle ended: ${event.payload}`));

        if (stoppingOpenWebui.current || userStoppedRef.current) {
          stoppingOpenWebui.current = false;
          openWebuiStartupDeadline.current = null;
          setOpenWebuiRunning(false);
          setOpenWebuiStatus("stopped");
          return;
        }

        // open-webui often keeps serving after the tracked child ends.
        const { host, port } = openWebuiSettingsRef.current;
        try {
          const status = await invoke("check_open_webui_health", { host, port });
          if (status === "running") {
            setOpenWebuiRunning(true);
            setOpenWebuiStatus("running");
            setOpenWebuiLog((prev) =>
              appendBoundedLog(
                prev,
                "Open WebUI is still responding on its port; keeping status as running.",
              ),
            );
            return;
          }
        } catch {
          // Not reachable
        }

        openWebuiStartupDeadline.current = null;
        setOpenWebuiRunning(false);
        setOpenWebuiStatus("error");
        showToast("Open WebUI exited", "error");
      })();
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [showToast]);

  useEffect(() => {
    if (openWebuiLogExpanded && openWebuiLogEndRef.current) {
      openWebuiLogEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [openWebuiLog, openWebuiLogExpanded]);

  // Poll health: faster while starting/running, slower while stopped (orphan detect only).
  useEffect(() => {
    if (openWebuiHealthInterval.current) {
      clearInterval(openWebuiHealthInterval.current);
    }

    const pollHealth = async () => {
      if (healthInFlight.current || stoppingOpenWebui.current) return;
      healthInFlight.current = true;
      const seq = ++openWebuiHealthPollSeq.current;
      const { host, port } = openWebuiSettingsRef.current;
      try {
        const status = await invoke("check_open_webui_health", { host, port });
        if (seq !== openWebuiHealthPollSeq.current) return;
        if (userStoppedRef.current) return;
        if (status === "running") {
          setOpenWebuiRunning(true);
          setOpenWebuiStatus("running");
          openWebuiStartupDeadline.current = null;
        }
      } catch {
        if (seq !== openWebuiHealthPollSeq.current) return;
        if (stoppingOpenWebui.current || userStoppedRef.current) {
          setOpenWebuiRunning(false);
          setOpenWebuiStatus("stopped");
          return;
        }
        if (openWebuiStartupDeadline.current && Date.now() < openWebuiStartupDeadline.current) {
          setOpenWebuiStatus("starting");
          return;
        }
        if (openWebuiRunningRef.current) {
          setOpenWebuiRunning(false);
          setOpenWebuiStatus("error");
        } else if (openWebuiStartupDeadline.current) {
          openWebuiStartupDeadline.current = null;
          setOpenWebuiRunning(false);
          setOpenWebuiStatus("error");
        }
      } finally {
        healthInFlight.current = false;
      }
    };

    void pollHealth();
    const intervalMs = openWebuiRunning || openWebuiStatus === "starting" ? 3000 : 10000;
    openWebuiHealthInterval.current = setInterval(pollHealth, intervalMs);

    return () => {
      openWebuiHealthPollSeq.current += 1;
      if (openWebuiHealthInterval.current) {
        clearInterval(openWebuiHealthInterval.current);
        openWebuiHealthInterval.current = null;
      }
    };
  }, [openWebuiHost, openWebuiPort, openWebuiRunning, openWebuiStatus]);

  useEffect(() => {
    let cancelled = false;

    const loadLogs = async () => {
      try {
        const logs = (await invoke("get_open_webui_log")) as string[];
        if (!cancelled && logs.length > 0) {
          setOpenWebuiLog(logs);
        }
      } catch {
        // No log buffer available
      }
    };

    void loadLogs();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshOpenWebuiVersions = useCallback(
    async (includeLatest = true) => {
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

      if (!includeLatest) return;

      try {
        const latest = await invoke<string>("get_open_webui_latest_version");
        setOpenWebuiLatestVersion(latest);
      } catch {
        setOpenWebuiLatestVersion(null);
      }
    },
    [openWebuiVenvPath],
  );

  useEffect(() => {
    if (!openWebuiVenvPath) {
      setOpenWebuiVersion(null);
      setOpenWebuiLatestVersion(null);
      return;
    }

    let cancelled = false;
    const cancelInstalled = deferAfterStartup(() => {
      if (!cancelled) void refreshOpenWebuiVersions(false);
    }, 2500);
    const cancelLatest = runWhenIdle(() => {
      if (cancelled) return;
      void invoke<string>("get_open_webui_latest_version")
        .then((latest) => {
          if (!cancelled) setOpenWebuiLatestVersion(latest);
        })
        .catch(() => {
          if (!cancelled) setOpenWebuiLatestVersion(null);
        });
    });
    return () => {
      cancelled = true;
      cancelInstalled();
      cancelLatest();
    };
  }, [openWebuiVenvPath, refreshOpenWebuiVersions]);

  const handleSetup = useCallback(async () => {
    if (openWebuiRunning || openWebuiSettingUp || openWebuiUpdating) return;
    if (!exePath) {
      showToast("Select the llama-server executable before setting up Open WebUI", "error");
      return;
    }
    const approved = window.confirm(
      `Set up Open WebUI in the standard .venv folder under ${venvParentPath || "the selected llama-server folder"} using Python 3.12? If Python 3.12 is not available, on Windows the launcher can install a separate Python 3.12 runtime for your user through the official Python Install Manager. The launcher will then download and install Open WebUI and its dependencies. Existing Python installations will not be replaced. A compatible existing .venv will be reused; an incompatible one will not be modified.`,
    );
    if (!approved) return;

    setOpenWebuiSettingUp(true);
    setOpenWebuiLog((prev) => appendBoundedLog(prev, "Preparing Open WebUI environment..."));
    try {
      const path = await invoke<string>("setup_open_webui", {
        exePath,
        venvParentPath: venvParentPath || null,
      });
      setOpenWebuiVenvPath(path);
      await saveAppConfig(buildCurrentConfig(undefined, { openWebui: { venvPath: path } }));
      showToast("Open WebUI setup completed", "success");
      setOpenWebuiLog((prev) => appendBoundedLog(prev, `Open WebUI environment ready: ${path}`));
    } catch (error) {
      const message = String(error);
      showToast(message, "error");
      setOpenWebuiLog((prev) => appendBoundedLog(prev, message));
    } finally {
      setOpenWebuiSettingUp(false);
    }
  }, [
    buildCurrentConfig,
    exePath,
    openWebuiRunning,
    openWebuiSettingUp,
    openWebuiUpdating,
    saveAppConfig,
    setOpenWebuiVenvPath,
    showToast,
    venvParentPath,
  ]);

  const handleRemoveEnvironment = useCallback(async () => {
    if (!openWebuiVenvPath || openWebuiRunning || openWebuiSettingUp || openWebuiUpdating) return;
    const approved = window.confirm(
      `Permanently delete the selected Open WebUI virtual environment and everything inside it?\n\n${openWebuiVenvPath}\n\nThis cannot be undone.`,
    );
    if (!approved) return;

    setOpenWebuiSettingUp(true);
    try {
      const result = await invoke<string>("remove_open_webui_venv", {
        venvPath: openWebuiVenvPath,
      });
      setOpenWebuiVenvPath("");
      await saveAppConfig(buildCurrentConfig(undefined, { openWebui: { venvPath: "" } }));
      setOpenWebuiVersion(null);
      setOpenWebuiLatestVersion(null);
      showToast(result, "success");
    } catch (error) {
      showToast(String(error), "error");
    } finally {
      setOpenWebuiSettingUp(false);
    }
  }, [
    buildCurrentConfig,
    openWebuiRunning,
    openWebuiSettingUp,
    openWebuiUpdating,
    openWebuiVenvPath,
    saveAppConfig,
    setOpenWebuiVenvPath,
    showToast,
  ]);

  const handleStart = useCallback(async () => {
    if (!isLlamaRunning) {
      showToast("Start the llama-server first", "error");
      return;
    }
    if (!openWebuiVenvPath) {
      showToast("Set up or select the Open WebUI environment first", "error");
      return;
    }

    userStoppedRef.current = false;
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
      try {
        const status = await invoke("check_open_webui_health", {
          host: openWebuiHost,
          port: openWebuiPort,
        });
        if (status === "running") {
          userStoppedRef.current = false;
          setOpenWebuiRunning(true);
          setOpenWebuiStatus("running");
          showToast("Open WebUI is already running on that port", "success");
          return;
        }
      } catch {
        // ignore
      }
      setOpenWebuiStatus("error");
      setOpenWebuiRunning(false);
      openWebuiStartupDeadline.current = null;
      showToast(String(error), "error");
      setOpenWebuiLog((prev) => appendBoundedLog(prev, String(error)));
    }
  }, [
    buildCurrentConfig,
    isLlamaRunning,
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
      userStoppedRef.current = true;
      stoppingOpenWebui.current = true;
      const result = await invoke("stop_open_webui", {
        port: openWebuiPort,
        venvPath: openWebuiVenvPath || null,
      });
      showToast(result as string, "success");
      setOpenWebuiRunning(false);
      setOpenWebuiStatus("stopped");
      openWebuiStartupDeadline.current = null;
      stoppingOpenWebui.current = false;
    } catch (error) {
      userStoppedRef.current = false;
      stoppingOpenWebui.current = false;
      showToast(String(error), "error");
    }
  }, [openWebuiPort, openWebuiVenvPath, showToast]);

  const handleUpdate = useCallback(async () => {
    if (!openWebuiVenvPath) {
      showToast("Set up or select the Open WebUI environment first", "error");
      return;
    }
    setOpenWebuiUpdating(true);
    setOpenWebuiLog((prev) => appendBoundedLog(prev, "Starting Open WebUI update..."));
    try {
      const result = await invoke<string>("update_open_webui", { venvPath: openWebuiVenvPath });
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
    openWebuiVenvPath &&
    isLlamaRunning &&
    !openWebuiRunning &&
    openWebuiStatus !== "starting" &&
    !openWebuiUpdating &&
    !openWebuiSettingUp,
  );

  return {
    openWebuiRunning,
    openWebuiStatus,
    openWebuiVersion,
    openWebuiLatestVersion,
    openWebuiUpdating,
    openWebuiSettingUp,
    updateAvailable,
    openWebuiLog,
    openWebuiLogExpanded,
    setOpenWebuiLogExpanded,
    openWebuiLogEndRef,
    openWebuiEndpoint,
    canStart,
    handleSetup,
    handleRemoveEnvironment,
    handleStart,
    handleStop,
    handleUpdate,
    refreshOpenWebuiVersions,
    clearOpenWebuiLog,
    copyOpenWebuiEndpoint,
  };
}
