import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AppConfig, ServerSettings } from "../types";
import { isLocalBindAddress, validateServerSettings } from "../utils/improvements.mjs";
import { appendBoundedLog } from "../utils/config";
import type { ToastType } from "./useToast";

export type ProcessStatus = "stopped" | "starting" | "running" | "error";

interface UseLlamaServerOptions {
  exePath: string;
  modelPath: string;
  mmprojPath: string;
  serverSettings: ServerSettings;
  buildCurrentConfig: (base?: AppConfig) => AppConfig;
  saveAppConfig: (cfg: AppConfig) => Promise<void>;
  showToast: (msg: string, type: ToastType) => void;
  confirmNetworkAccess?: (host: string) => boolean;
}

export function useLlamaServer({
  exePath,
  modelPath,
  mmprojPath,
  serverSettings,
  buildCurrentConfig,
  saveAppConfig,
  showToast,
  confirmNetworkAccess = (host) =>
    window.confirm(
      `This will bind llama-server to ${host} and expose its unauthenticated API to your local network. Continue only on a trusted network. Continue?`,
    ),
}: UseLlamaServerOptions) {
  const [isRunning, setIsRunning] = useState(false);
  const [isManaged, setIsManaged] = useState(false);
  const [externalServerEndpoint, setExternalServerEndpoint] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<ProcessStatus>("stopped");
  const [serverLog, setServerLog] = useState<string[]>([]);
  const [logExpanded, setLogExpanded] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const healthInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const healthPollSeq = useRef(0);
  const healthInFlight = useRef(false);
  const healthFailCount = useRef(0);
  const startupDeadline = useRef<number | null>(null);
  const stoppingServer = useRef(false);
  const serverSettingsRef = useRef(serverSettings);

  useEffect(() => {
    serverSettingsRef.current = serverSettings;
  }, [serverSettings]);

  useEffect(() => {
    const unlisten = listen<string>("server-stderr", (event) => {
      setServerLog((prev) => appendBoundedLog(prev, event.payload));
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    const unlisten = listen<string>("server-exited", (event) => {
      setIsRunning(false);
      setIsManaged(false);
      startupDeadline.current = null;
      setServerLog((prev) => appendBoundedLog(prev, `Process exited: ${event.payload}`));
      if (stoppingServer.current) {
        stoppingServer.current = false;
        setServerStatus("stopped");
      } else {
        setServerStatus("error");
        showToast("llama-server exited", "error");
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [showToast]);

  useEffect(() => {
    let cancelled = false;

    const reconcile = async () => {
      const { host, port } = serverSettingsRef.current;
      try {
        const logs = (await invoke("get_server_log")) as string[];
        if (!cancelled && logs.length > 0) {
          setServerLog(logs);
        }
      } catch {
        // No log buffer available
      }

      try {
        const managedEndpoint = await invoke<[string, number] | null>(
          "get_managed_server_endpoint",
        );
        const managed = Boolean(
          managedEndpoint && managedEndpoint[0] === host && managedEndpoint[1] === port,
        );
        if (!cancelled) {
          setIsManaged(managed);
          setIsRunning(managed);
        }
        const status = await invoke("check_server_health", { host, port });
        if (!cancelled && (status === "healthy" || status === "running")) {
          if (managed) {
            setIsRunning(true);
            setServerStatus("running");
            setExternalServerEndpoint(null);
          } else {
            setExternalServerEndpoint(`http://${host}:${port}`);
          }
        } else if (!cancelled && managed) {
          setIsRunning(false);
          setServerStatus("error");
        }
      } catch {
        // Server not reachable or process state unavailable
      }
    };

    void reconcile();

    return () => {
      cancelled = true;
    };
  }, [serverSettings.host, serverSettings.port]);

  useEffect(() => {
    if (isManaged || serverStatus === "starting") {
      return;
    }

    let cancelled = false;
    const detectExternalServer = async () => {
      try {
        const { host, port } = serverSettingsRef.current;
        const status = await invoke("check_server_health", { host, port });
        const managedEndpoint = await invoke<[string, number] | null>(
          "get_managed_server_endpoint",
        );
        const managed = Boolean(
          managedEndpoint && managedEndpoint[0] === host && managedEndpoint[1] === port,
        );
        if (!cancelled) setIsManaged(managed);
        if (!cancelled) {
          setExternalServerEndpoint(
            !managed && (status === "healthy" || status === "running")
              ? `http://${host}:${port}`
              : null,
          );
        }
      } catch {
        if (!cancelled) setExternalServerEndpoint(null);
      }
    };

    void detectExternalServer();
    const interval = setInterval(detectExternalServer, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isManaged, serverStatus, serverSettings.host, serverSettings.port]);

  useEffect(() => {
    if (logExpanded && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [serverLog, logExpanded]);

  useEffect(() => {
    if (isRunning) {
      if (healthInterval.current) {
        clearInterval(healthInterval.current);
      }
      const pollHealth = async () => {
        if (healthInFlight.current) return;
        healthInFlight.current = true;
        const seq = ++healthPollSeq.current;
        try {
          const status = await invoke("check_server_health", {
            host: serverSettings.host,
            port: serverSettings.port,
          });
          if (seq !== healthPollSeq.current) return;
          healthFailCount.current = 0;
          setServerStatus(status === "healthy" || status === "running" ? "running" : "error");
          startupDeadline.current = null;
        } catch {
          if (seq !== healthPollSeq.current) return;
          if (startupDeadline.current && Date.now() < startupDeadline.current) {
            setServerStatus("starting");
          } else {
            healthFailCount.current += 1;
            setServerStatus("error");
            // After sustained failures, drop "running" so Stop/Start isn't stuck.
            if (healthFailCount.current >= 3) {
              setIsRunning(false);
            }
          }
        } finally {
          healthInFlight.current = false;
        }
      };
      void pollHealth();
      healthInterval.current = setInterval(pollHealth, 3000);
    } else {
      healthPollSeq.current += 1;
      if (healthInterval.current) {
        clearInterval(healthInterval.current);
        healthInterval.current = null;
      }
    }
    return () => {
      healthPollSeq.current += 1;
      if (healthInterval.current) clearInterval(healthInterval.current);
    };
  }, [isRunning, serverSettings.host, serverSettings.port]);

  const handleStart = useCallback(async () => {
    if (!exePath) {
      showToast("Please select the llama-server executable", "error");
      return;
    }
    if (!modelPath) {
      showToast("Please select a model", "error");
      return;
    }
    const validation = validateServerSettings(serverSettings);
    if (!validation.valid) {
      showToast(validation.errors.join(" "), "error");
      return;
    }
    if (!isLocalBindAddress(serverSettings.host) && !confirmNetworkAccess(serverSettings.host)) {
      return;
    }

    setExternalServerEndpoint(null);
    setServerStatus("starting");
    stoppingServer.current = false;
    setServerLog([]);
    await saveAppConfig(buildCurrentConfig());

    try {
      const result = await invoke("start_llama_server", {
        config: {
          exe_path: exePath,
          model_path: modelPath,
          mmproj_path: mmprojPath || null,
          host: serverSettings.host,
          port: serverSettings.port,
          ctx_size: serverSettings.ctxSize,
          ngl: serverSettings.ngl,
          temp: serverSettings.temp,
          threads: serverSettings.threads,
          batch_size: serverSettings.batchSize,
          flash_attn: serverSettings.flashAttn,
          top_p: serverSettings.topP,
          top_k: serverSettings.topK,
          min_p: serverSettings.minP,
          repeat_penalty: serverSettings.repeatPenalty,
          presence_penalty: serverSettings.presencePenalty,
          main_gpu: serverSettings.mainGpu,
          tensor_split: serverSettings.tensorSplit,
          no_mmap: serverSettings.noMmap,
          no_webui: serverSettings.noWebui,
        },
      });
      setIsRunning(true);
      setIsManaged(true);
      setExternalServerEndpoint(null);
      startupDeadline.current = Date.now() + 15000;
      setServerStatus("starting");
      showToast(result as string, "success");
    } catch (error) {
      setServerStatus("error");
      setIsRunning(false);
      setIsManaged(false);
      startupDeadline.current = null;
      showToast(String(error), "error");
    }
  }, [
    buildCurrentConfig,
    exePath,
    modelPath,
    mmprojPath,
    saveAppConfig,
    serverSettings,
    showToast,
    confirmNetworkAccess,
  ]);

  const handleStop = useCallback(async () => {
    try {
      stoppingServer.current = true;
      const result = await invoke("stop_llama_server");
      showToast(result as string, "success");
      setIsRunning(false);
      setIsManaged(false);
      setExternalServerEndpoint(null);
      setServerStatus("stopped");
      startupDeadline.current = null;
    } catch (error) {
      stoppingServer.current = false;
      showToast(String(error), "error");
    }
  }, [showToast]);

  const clearServerLog = useCallback(() => {
    void invoke("clear_server_log");
    setServerLog([]);
  }, []);

  const copyEndpoint = useCallback(async () => {
    if (!isManaged) return;
    try {
      await navigator.clipboard.writeText(`http://${serverSettings.host}:${serverSettings.port}`);
      showToast("Endpoint copied", "success");
    } catch {
      showToast("Failed to copy endpoint", "error");
    }
  }, [isManaged, serverSettings.host, serverSettings.port, showToast]);

  const endpoint = `http://${serverSettings.host}:${serverSettings.port}`;
  const openAiEndpoint = `${endpoint}/v1`;
  const copyOpenAiEndpoint = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(openAiEndpoint);
      showToast("OpenAI endpoint copied", "success");
    } catch {
      showToast("Failed to copy endpoint", "error");
    }
  }, [openAiEndpoint, showToast]);

  const canStart = Boolean(
    exePath && modelPath && serverStatus !== "starting" && !externalServerEndpoint && !isManaged,
  );

  return {
    isRunning,
    isManaged,
    externalServerEndpoint,
    serverStatus,
    serverLog,
    logExpanded,
    setLogExpanded,
    logEndRef,
    endpoint,
    openAiEndpoint,
    canStart,
    handleStart,
    handleStop,
    clearServerLog,
    copyEndpoint,
    copyOpenAiEndpoint,
  };
}
