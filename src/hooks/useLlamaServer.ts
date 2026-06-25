import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AppConfig, ServerSettings } from "../types";
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
}

export function useLlamaServer({
  exePath,
  modelPath,
  mmprojPath,
  serverSettings,
  buildCurrentConfig,
  saveAppConfig,
  showToast,
}: UseLlamaServerOptions) {
  const [isRunning, setIsRunning] = useState(false);
  const [serverStatus, setServerStatus] = useState<ProcessStatus>("stopped");
  const [serverLog, setServerLog] = useState<string[]>([]);
  const [logExpanded, setLogExpanded] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const healthInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const startupDeadline = useRef<number | null>(null);
  const stoppingServer = useRef(false);

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
        try {
          const status = await invoke("check_server_health", {
            host: serverSettings.host,
            port: serverSettings.port,
          });
          setServerStatus(status === "healthy" || status === "running" ? "running" : "error");
          startupDeadline.current = null;
        } catch {
          if (startupDeadline.current && Date.now() < startupDeadline.current) {
            setServerStatus("starting");
          } else {
            setServerStatus("error");
          }
        }
      };
      void pollHealth();
      healthInterval.current = setInterval(pollHealth, 3000);
    } else if (healthInterval.current) {
      clearInterval(healthInterval.current);
      healthInterval.current = null;
    }
    return () => {
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
      startupDeadline.current = Date.now() + 15000;
      setServerStatus("starting");
      showToast(result as string, "success");
    } catch (error) {
      setServerStatus("error");
      setIsRunning(false);
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
  ]);

  const handleStop = useCallback(async () => {
    try {
      stoppingServer.current = true;
      const result = await invoke("stop_llama_server");
      showToast(result as string, "success");
      setIsRunning(false);
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
    if (!isRunning) return;
    try {
      await navigator.clipboard.writeText(`http://${serverSettings.host}:${serverSettings.port}`);
      showToast("Endpoint copied", "success");
    } catch {
      showToast("Failed to copy endpoint", "error");
    }
  }, [isRunning, serverSettings.host, serverSettings.port, showToast]);

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

  const canStart = Boolean(exePath && modelPath && serverStatus !== "starting");

  return {
    isRunning,
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
