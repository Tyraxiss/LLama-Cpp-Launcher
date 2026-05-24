import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { HfDownloadPanel } from "./components/HfDownloadPanel";
import { HelpPanel } from "./components/HelpPanel";
import { LogPanel } from "./components/LogPanel";
import { PRESETS } from "./presets";
import { DEFAULT_THEME, THEME_OPTIONS, isThemeId, type ThemeId } from "./themes";
import {
  Zap,
  Play, Square, FolderOpen, Plus, X, CheckCircle,
  AlertCircle, Loader, Cpu, HardDrive, Wifi, Copy,
  Activity, Server, SlidersHorizontal, Terminal, RefreshCw,
  Globe, Download, Palette, BookOpen,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ModelInfo {
  path: string;
  filename: string;
  size_bytes: number;
}

interface HfGgufFile {
  path: string;
  filename: string;
  size_bytes: number | null;
}

interface HfDownloadProgress {
  repo: string;
  filename: string;
  target_path: string;
  downloaded_bytes: number;
  total_bytes: number | null;
  status: "downloading" | "complete" | "cancelled" | "error";
  error: string | null;
}

interface DownloadHistoryItem {
  repo: string;
  filename: string;
  path: string;
  completed_at: string;
}

interface AppConfig {
  exe_path: string | null;
  open_webui_venv_path: string | null;
  last_theme: string;
  model_directories: string[];
  last_model: string | null;
  last_port: number;
  last_host: string;
  last_open_webui_port: number;
  last_open_webui_host: string;
  last_ctx_size: number;
  last_ngl: number;
  last_temp: number;
  last_threads: number;
  last_batch_size: number;
  last_flash_attn: boolean;
  last_top_p: number;
  last_top_k: number;
  last_min_p: number | null;
  last_repeat_penalty: number;
  last_presence_penalty: number | null;
  last_main_gpu: number | null;
  last_tensor_split: string | null;
  last_no_mmap: boolean | null;
  last_no_webui: boolean | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_LOG_LINES = 200;
const DOWNLOAD_HISTORY_KEY = "llama-launcher-download-history";

function appendBoundedLog(lines: string[], line: string): string[] {
  const next = [...lines, line];
  return next.length > MAX_LOG_LINES ? next.slice(next.length - MAX_LOG_LINES) : next;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "—";
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

function defaultConfig(): AppConfig {
  return {
    exe_path: null,
    open_webui_venv_path: null,
    last_theme: DEFAULT_THEME,
    model_directories: [],
    last_model: null,
    last_port: 8080,
    last_host: "127.0.0.1",
    last_open_webui_port: 3000,
    last_open_webui_host: "127.0.0.1",
    last_ctx_size: 8192,
    last_ngl: 99,
    last_temp: 0.7,
    last_threads: 0,
    last_batch_size: 512,
    last_flash_attn: false,
    last_top_p: 0.9,
    last_top_k: 40,
    last_min_p: 0.05,
    last_repeat_penalty: 1.1,
    last_presence_penalty: 0.0,
    last_main_gpu: null,
    last_tensor_split: null,
    last_no_mmap: null,
    last_no_webui: null,
  };
}

function samePath(a: string, b: string): boolean {
  return a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0;
}

function loadDownloadHistory(): DownloadHistoryItem[] {
  try {
    return JSON.parse(localStorage.getItem(DOWNLOAD_HISTORY_KEY) || "[]").slice(0, 8);
  } catch {
    return [];
  }
}

function saveDownloadHistory(items: DownloadHistoryItem[]) {
  localStorage.setItem(DOWNLOAD_HISTORY_KEY, JSON.stringify(items.slice(0, 8)));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function App() {
  // ---- State ----
  const [config, setConfig] = useState<AppConfig>(defaultConfig);
  const [exePath, setExePath] = useState("");
  const [modelPath, setModelPath] = useState("");
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [serverStatus, setServerStatus] = useState<"stopped" | "starting" | "running" | "error">("stopped");
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [scanInProgress, setScanInProgress] = useState(false);
  const [activeTab, setActiveTab] = useState<"server" | "downloads" | "help">("server");
  const [theme, setTheme] = useState<ThemeId>(DEFAULT_THEME);

  // Settings
  const [ctxSize, setCtxSize] = useState(8192);
  const [port, setPort] = useState(8080);
  const [host, setHost] = useState("127.0.0.1");
  const [ngl, setNgl] = useState(99);
  const [temp, setTemp] = useState(0.7);
  const [threads, setThreads] = useState(0);
  const [batchSize, setBatchSize] = useState(512);
  const [topP, setTopP] = useState(0.9);
  const [topK, setTopK] = useState(40);
  const [minP, setMinP] = useState(0.05);
  const [repeatPenalty, setRepeatPenalty] = useState(1.1);
  const [presencePenalty, setPresencePenalty] = useState(0.0);
  const [flashAttn, setFlashAttn] = useState(false);
  const [mainGpu, setMainGpu] = useState<number | null>(null);
  const [tensorSplit, setTensorSplit] = useState<string | null>(null);
  const [noMmap, setNoMmap] = useState(false);
  const [noWebui, setNoWebui] = useState(false);
  const [serverLog, setServerLog] = useState<string[]>([]);
  const [logExpanded, setLogExpanded] = useState(false);
  const [openWebuiVenvPath, setOpenWebuiVenvPath] = useState("");
  const [openWebuiHost, setOpenWebuiHost] = useState("127.0.0.1");
  const [openWebuiPort, setOpenWebuiPort] = useState(3000);
  const [openWebuiRunning, setOpenWebuiRunning] = useState(false);
  const [openWebuiStatus, setOpenWebuiStatus] = useState<"stopped" | "starting" | "running" | "error">("stopped");
  const [openWebuiLog, setOpenWebuiLog] = useState<string[]>([]);
  const [openWebuiLogExpanded, setOpenWebuiLogExpanded] = useState(false);
  const [hfRepo, setHfRepo] = useState("");
  const [hfToken, setHfToken] = useState("");
  const [hfFiles, setHfFiles] = useState<HfGgufFile[]>([]);
  const [hfSelectedFile, setHfSelectedFile] = useState("");
  const [hfTargetDir, setHfTargetDir] = useState("");
  const [hfLoadingFiles, setHfLoadingFiles] = useState(false);
  const [hfDownloading, setHfDownloading] = useState(false);
  const [hfProgress, setHfProgress] = useState<HfDownloadProgress | null>(null);
  const [downloadHistory, setDownloadHistory] = useState<DownloadHistoryItem[]>(loadDownloadHistory);

  const logEndRef = useRef<HTMLDivElement>(null);
  const openWebuiLogEndRef = useRef<HTMLDivElement>(null);
  const healthInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const openWebuiHealthInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const startupDeadline = useRef<number | null>(null);
  const openWebuiStartupDeadline = useRef<number | null>(null);
  const stoppingServer = useRef(false);
  const stoppingOpenWebui = useRef(false);

  // ---- Toast helper ----
  const showToast = useCallback((msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ---- Save config helper ----
  const persistConfig = useCallback(
    async (cfg: AppConfig) => {
      try {
        await invoke("save_config", { config: cfg });
        setConfig(cfg);
      } catch (e) {
        console.error("Failed to persist config:", e);
      }
    },
    [],
  );

  // ---- Initial load ----
  useEffect(() => {
    (async () => {
      let cfg: AppConfig = defaultConfig();

      try {
        cfg = (await invoke("load_config")) as AppConfig;
        setConfig(cfg);
        const savedTheme = isThemeId(cfg.last_theme) ? cfg.last_theme : DEFAULT_THEME;
        setTheme(savedTheme);

        if (cfg.exe_path) setExePath(cfg.exe_path);
        if (cfg.last_model) setModelPath(cfg.last_model);
        setPort(cfg.last_port ?? 8080);
        setHost(cfg.last_host ?? "127.0.0.1");
        if (cfg.open_webui_venv_path) setOpenWebuiVenvPath(cfg.open_webui_venv_path);
        setOpenWebuiPort(cfg.last_open_webui_port ?? 3000);
        setOpenWebuiHost(cfg.last_open_webui_host ?? "127.0.0.1");
        setCtxSize(cfg.last_ctx_size ?? 8192);
        setNgl(cfg.last_ngl ?? 99);
        setTemp(cfg.last_temp ?? 0.7);
        setThreads(cfg.last_threads ?? 0);
        setBatchSize(cfg.last_batch_size ?? 512);
        setTopP(cfg.last_top_p ?? 0.9);
        setTopK(cfg.last_top_k ?? 40);
        setMinP(cfg.last_min_p ?? 0.05);
        setRepeatPenalty(cfg.last_repeat_penalty ?? 1.1);
        setPresencePenalty(cfg.last_presence_penalty ?? 0.0);
        setFlashAttn(cfg.last_flash_attn ?? false);
        setMainGpu(cfg.last_main_gpu ?? null);
        setTensorSplit(cfg.last_tensor_split ?? null);
        setNoMmap(cfg.last_no_mmap ?? false);
        setNoWebui(cfg.last_no_webui ?? false);

        if (cfg.model_directories?.length) {
          const found = (await invoke("scan_models", {
            directories: cfg.model_directories,
          })) as ModelInfo[];
          setModels(found);
          if (!cfg.last_model && found.length > 0) {
            setModelPath(found[0].path);
            const updated = { ...cfg, last_model: found[0].path };
            cfg = updated;
            await persistConfig(updated);
          }
        }
      } catch {
        // Use defaults
      }

      // Auto-detect server if no path saved
      if (!cfg.exe_path) {
        try {
          const detected = (await invoke("auto_detect_server")) as string | null;
          if (detected) {
            setExePath(detected);
            const updated = { ...cfg, exe_path: detected };
            await persistConfig(updated);
          }
        } catch {
          // silent
        }
      }

      if (!cfg.open_webui_venv_path) {
        try {
          const detected = (await invoke("auto_detect_open_webui_venv")) as string | null;
          if (detected) {
            setOpenWebuiVenvPath(detected);
            const updated = { ...cfg, open_webui_venv_path: detected };
            await persistConfig(updated);
          }
        } catch {
          // silent
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Stderr event listener ----
  useEffect(() => {
    const unlisten = listen<string>("server-stderr", (event) => {
      setServerLog((prev) => appendBoundedLog(prev, event.payload));
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // ---- Server exit listener ----
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

  // ---- Hugging Face download progress listener ----
  useEffect(() => {
    const unlisten = listen<HfDownloadProgress>("hf-download-progress", (event) => {
      setHfProgress(event.payload);
      if (event.payload.status === "downloading") {
        setHfDownloading(true);
      }
      if (["complete", "cancelled", "error"].includes(event.payload.status)) {
        setHfDownloading(false);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    if (!hfTargetDir && config.model_directories.length > 0) {
      setHfTargetDir(config.model_directories[0]);
    }
  }, [config.model_directories, hfTargetDir]);

  // ---- Open WebUI event listeners ----
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

  // ---- Auto-scroll log ----
  useEffect(() => {
    if (logExpanded && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [serverLog, logExpanded]);

  useEffect(() => {
    if (openWebuiLogExpanded && openWebuiLogEndRef.current) {
      openWebuiLogEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [openWebuiLog, openWebuiLogExpanded]);

  // ---- Health polling ----
  useEffect(() => {
    if (isRunning) {
      if (healthInterval.current) {
        clearInterval(healthInterval.current);
      }
      const pollHealth = async () => {
        try {
          const status = await invoke("check_server_health", { host, port });
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
    } else {
      if (healthInterval.current) {
        clearInterval(healthInterval.current);
        healthInterval.current = null;
      }
    }
    return () => {
      if (healthInterval.current) clearInterval(healthInterval.current);
    };
  }, [isRunning, host, port]);

  // ---- Open WebUI health polling ----
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
    } else {
      if (openWebuiHealthInterval.current) {
        clearInterval(openWebuiHealthInterval.current);
        openWebuiHealthInterval.current = null;
      }
    }
    return () => {
      if (openWebuiHealthInterval.current) clearInterval(openWebuiHealthInterval.current);
    };
  }, [openWebuiRunning, openWebuiHost, openWebuiPort]);

  // ---- Actions ----
  const pickExe = async () => {
    const selected = await open({
      multiple: false,
      title: "Select llama-server executable",
      filters: [
        {
          name: "Executable",
          extensions: ["exe", "bin", "*"],
        },
      ],
    });
    if (selected && typeof selected === "string") {
      setExePath(selected);
      const updated = { ...config, exe_path: selected };
      await persistConfig(updated);
    }
  };

  const pickModel = async () => {
    const selected = await open({
      multiple: false,
      title: "Select model file",
      filters: [{ name: "GGUF Model", extensions: ["gguf"] }],
    });
    if (selected && typeof selected === "string") {
      setModelPath(selected);
      const updated = { ...config, last_model: selected };
      await persistConfig(updated);
    }
  };

  const pickOpenWebuiVenv = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select Open WebUI virtual environment folder",
    });
    if (selected && typeof selected === "string") {
      setOpenWebuiVenvPath(selected);
      const updated = { ...config, open_webui_venv_path: selected };
      await persistConfig(updated);
    }
  };

  const addModelDirectory = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select model directory to scan",
    });
    if (selected && typeof selected === "string") {
      if (config.model_directories.some((dir) => samePath(dir, selected))) return;
      const dirs = [...config.model_directories, selected];
      const updated = { ...config, model_directories: dirs };
      await persistConfig(updated);
      // Rescan
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
  };

  const removeModelDirectory = async (dir: string) => {
    const dirs = config.model_directories.filter((d) => d !== dir);
    const updated = { ...config, model_directories: dirs };
    await persistConfig(updated);
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
  };

  const browseHfTargetDir = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select model download folder",
    });
    if (selected && typeof selected === "string") {
      setHfTargetDir(selected);
      if (!config.model_directories.some((dir) => samePath(dir, selected))) {
        const dirs = [...config.model_directories, selected];
        await persistConfig({ ...config, model_directories: dirs });
      }
    }
  };

  const lookupHfFiles = async () => {
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
    } catch (e) {
      showToast(String(e), "error");
    } finally {
      setHfLoadingFiles(false);
    }
  };

  const startHfDownload = async () => {
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

    try {
      setHfDownloading(true);
      setHfProgress(null);
      const downloadedPath = (await invoke("download_hf_model", {
        config: {
          repo: hfRepo.trim(),
          file_path: hfSelectedFile,
          target_dir: hfTargetDir,
          token: hfToken.trim() || null,
        },
      })) as string;

      const dirs = config.model_directories.some((dir) => samePath(dir, hfTargetDir))
        ? config.model_directories
        : [...config.model_directories, hfTargetDir];
      const found = (await invoke("scan_models", { directories: dirs })) as ModelInfo[];
      setModels(found);
      setModelPath(downloadedPath);
      await persistConfig({ ...config, model_directories: dirs, last_model: downloadedPath });
      const nextHistory = [
        {
          repo: hfRepo.trim(),
          filename: downloadedPath.split(/[/\\]/).pop() || downloadedPath,
          path: downloadedPath,
          completed_at: new Date().toISOString(),
        },
        ...downloadHistory.filter((item) => item.path !== downloadedPath),
      ].slice(0, 8);
      setDownloadHistory(nextHistory);
      saveDownloadHistory(nextHistory);
      showToast("Model downloaded and selected", "success");
    } catch (e) {
      if (String(e) !== "Download cancelled") {
        showToast(String(e), "error");
      }
    } finally {
      setHfDownloading(false);
    }
  };

  const cancelHfDownload = async () => {
    try {
      await invoke("cancel_hf_download");
    } catch (e) {
      showToast(String(e), "error");
    }
  };

  const clearDownloadHistory = () => {
    setDownloadHistory([]);
    saveDownloadHistory([]);
  };

  const rescanModels = async () => {
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
  };

  const handleModelSelect = async (path: string) => {
    setModelPath(path);
    const updated = { ...config, last_model: path };
    await persistConfig(updated);
  };

  const applyPreset = async (key: string) => {
    const preset = PRESETS[key];
    if (!preset) return;
    setCtxSize(preset.settings.ctxSize);
    setTemp(preset.settings.temp);
    setTopP(preset.settings.topP);
    setTopK(preset.settings.topK);
    setMinP(preset.settings.minP);
    setRepeatPenalty(preset.settings.repeatPenalty);
    setPresencePenalty(preset.settings.presencePenalty);
    setThreads(preset.settings.threads);
    setBatchSize(preset.settings.batchSize);
    setNgl(preset.settings.ngl ?? 99);
    setMainGpu(preset.settings.mainGpu ?? null);
    setTensorSplit(preset.settings.tensorSplit ?? null);
    setNoMmap(preset.settings.noMmap ?? false);
    setNoWebui(preset.settings.noWebui ?? false);
    setSelectedPreset(key);
    await persistConfig({
      ...config,
      last_ctx_size: preset.settings.ctxSize,
      last_temp: preset.settings.temp,
      last_top_p: preset.settings.topP,
      last_top_k: preset.settings.topK,
      last_min_p: preset.settings.minP,
      last_repeat_penalty: preset.settings.repeatPenalty,
      last_presence_penalty: preset.settings.presencePenalty,
      last_threads: preset.settings.threads,
      last_batch_size: preset.settings.batchSize,
      last_ngl: preset.settings.ngl,
      last_main_gpu: preset.settings.mainGpu,
      last_tensor_split: preset.settings.tensorSplit,
      last_no_mmap: preset.settings.noMmap,
      last_no_webui: preset.settings.noWebui,
    });
    showToast(`${preset.name} preset applied`, "success");
  };

  const handleThemeChange = async (nextTheme: ThemeId) => {
    setTheme(nextTheme);
    await persistConfig({ ...config, last_theme: nextTheme });
  };

  const handleStart = async () => {
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
    const updated: AppConfig = {
      ...config,
      exe_path: exePath,
      last_model: modelPath,
      last_port: port,
      last_host: host,
      last_ctx_size: ctxSize,
      last_ngl: ngl,
      last_temp: temp,
      last_threads: threads,
      last_batch_size: batchSize,
      last_flash_attn: flashAttn,
      last_top_p: topP,
      last_top_k: topK,
      last_min_p: minP,
      last_repeat_penalty: repeatPenalty,
      last_presence_penalty: presencePenalty,
      last_main_gpu: mainGpu,
      last_tensor_split: tensorSplit,
      last_no_mmap: noMmap,
      last_no_webui: noWebui,
    };
    await persistConfig(updated);

    try {
      const result = await invoke("start_llama_server", {
        config: {
          exe_path: exePath,
          model_path: modelPath,
          host,
          port,
          ctx_size: ctxSize,
          ngl,
          temp,
          threads,
          batch_size: batchSize,
          flash_attn: flashAttn,
          top_p: topP,
          top_k: topK,
          min_p: minP,
          repeat_penalty: repeatPenalty,
          presence_penalty: presencePenalty,
          main_gpu: mainGpu,
          tensor_split: tensorSplit,
          no_mmap: noMmap,
          no_webui: noWebui,
        },
      });
      setIsRunning(true);
      startupDeadline.current = Date.now() + 15000;
      setServerStatus("starting");
      showToast(result as string, "success");
    } catch (e) {
      setServerStatus("error");
      setIsRunning(false);
      startupDeadline.current = null;
      showToast(String(e), "error");
    }
  };

  const handleStop = async () => {
    try {
      stoppingServer.current = true;
      const result = await invoke("stop_llama_server");
      showToast(result as string, "success");
      setIsRunning(false);
      setServerStatus("stopped");
      startupDeadline.current = null;
    } catch (e) {
      stoppingServer.current = false;
      showToast(String(e), "error");
    }
  };

  const handleStartOpenWebui = async () => {
    if (!openWebuiVenvPath) {
      showToast("Please select the Open WebUI venv folder", "error");
      return;
    }

    setOpenWebuiStatus("starting");
    stoppingOpenWebui.current = false;
    setOpenWebuiLog([]);
    const updated: AppConfig = {
      ...config,
      open_webui_venv_path: openWebuiVenvPath,
      last_open_webui_port: openWebuiPort,
      last_open_webui_host: openWebuiHost,
      last_port: port,
      last_host: host,
    };
    await persistConfig(updated);

    try {
      const result = await invoke("start_open_webui", {
        config: {
          venv_path: openWebuiVenvPath,
          host: openWebuiHost,
          port: openWebuiPort,
          llama_host: host,
          llama_port: port,
        },
      });
      setOpenWebuiRunning(true);
      openWebuiStartupDeadline.current = Date.now() + 20000;
      setOpenWebuiStatus("starting");
      showToast(result as string, "success");
    } catch (e) {
      setOpenWebuiStatus("error");
      setOpenWebuiRunning(false);
      openWebuiStartupDeadline.current = null;
      showToast(String(e), "error");
      setOpenWebuiLog((prev) => appendBoundedLog(prev, String(e)));
    }
  };

  const handleStopOpenWebui = async () => {
    try {
      stoppingOpenWebui.current = true;
      const result = await invoke("stop_open_webui");
      showToast(result as string, "success");
      setOpenWebuiRunning(false);
      setOpenWebuiStatus("stopped");
      openWebuiStartupDeadline.current = null;
    } catch (e) {
      stoppingOpenWebui.current = false;
      showToast(String(e), "error");
    }
  };

  const copyEndpoint = async () => {
    if (!isRunning) return;
    try {
      await navigator.clipboard.writeText(`http://${host}:${port}`);
      showToast("Endpoint copied", "success");
    } catch {
      showToast("Failed to copy endpoint", "error");
    }
  };

  const copyOpenAiEndpoint = async () => {
    try {
      await navigator.clipboard.writeText(`${endpoint}/v1`);
      showToast("OpenAI endpoint copied", "success");
    } catch {
      showToast("Failed to copy endpoint", "error");
    }
  };

  const copyOpenWebuiEndpoint = async () => {
    try {
      await navigator.clipboard.writeText(`http://${openWebuiHost}:${openWebuiPort}`);
      showToast("Open WebUI URL copied", "success");
    } catch {
      showToast("Failed to copy URL", "error");
    }
  };

  // ---- Derived ----
  const endpoint = `http://${host}:${port}`;
  const openWebuiEndpoint = `http://${openWebuiHost}:${openWebuiPort}`;
  const openAiEndpoint = `${endpoint}/v1`;
  const canStart = Boolean(exePath && modelPath && serverStatus !== "starting");
  const canStartOpenWebui = Boolean(openWebuiVenvPath && openWebuiStatus !== "starting");
  const totalModelBytes = models.reduce((sum, model) => sum + model.size_bytes, 0);
  const statusTone =
    serverStatus === "running"
      ? "running"
      : serverStatus === "error"
        ? "error"
        : serverStatus === "starting"
          ? "starting"
          : "";
  const statusLabel =
    serverStatus === "running"
      ? `Running on ${port}`
      : serverStatus === "starting"
        ? "Starting..."
        : serverStatus === "error"
          ? "Connection lost"
          : "Stopped";

  const selectedModelInfo = models.find((m) => m.path === modelPath);
  const savedModelFilename = modelPath ? modelPath.split(/[/\\]/).pop() || modelPath : "";
  const hasSavedModelOutsideScan = Boolean(modelPath && !selectedModelInfo);
  const hfDownloadPanel = (
    <HfDownloadPanel
      repo={hfRepo}
      token={hfToken}
      files={hfFiles}
      selectedFilePath={hfSelectedFile}
      targetDir={hfTargetDir}
      targetDirs={config.model_directories}
      loadingFiles={hfLoadingFiles}
      downloading={hfDownloading}
      progress={hfProgress}
      formatBytes={formatBytes}
      onRepoChange={setHfRepo}
      onTokenChange={setHfToken}
      onSelectedFileChange={setHfSelectedFile}
      onTargetDirChange={setHfTargetDir}
      onLookupFiles={lookupHfFiles}
      onBrowseTargetDir={browseHfTargetDir}
      onStartDownload={startHfDownload}
      onCancelDownload={cancelHfDownload}
    />
  );

  // ---- Render ----
  return (
    <div className="app-container" data-theme={theme}>
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <span className="header-logo">🦙</span>
          <div>
            <span className="header-title">LLama C++ Launcher</span>
            <span className="header-subtitle">local llama.cpp server control</span>
          </div>
          <span className="header-badge">v1.0</span>
        </div>
        <div className="header-right">
          <label className="theme-select" title="Theme">
            <Palette size={14} />
            <select
              value={theme}
              onChange={(e) => handleThemeChange(e.target.value as ThemeId)}
            >
              {THEME_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
          <div className={`status-indicator ${statusTone}`}>
            <span className={`status-dot ${statusTone}`} />
            <span>{statusLabel}</span>
          </div>
        </div>
      </header>

      <nav className="tab-bar">
        <button
          className={`tab-button ${activeTab === "server" ? "active" : ""}`}
          onClick={() => setActiveTab("server")}
        >
          <Server size={14} />
          Server
        </button>
        <button
          className={`tab-button ${activeTab === "downloads" ? "active" : ""}`}
          onClick={() => setActiveTab("downloads")}
        >
          <Download size={14} />
          Downloads
          {hfDownloading && <span className="tab-dot" />}
        </button>
        <button
          className={`tab-button ${activeTab === "help" ? "active" : ""}`}
          onClick={() => setActiveTab("help")}
        >
          <BookOpen size={14} />
          Help
        </button>
      </nav>

      {/* Main */}
      {activeTab === "server" ? (
      <div className="main-content">
        {/* Left Panel */}
        <aside className="left-panel">
          {/* Server executable */}
          <div className="card">
            <div className="card-header">
              <Cpu size={14} className="icon" />
              <h3>Server Executable</h3>
            </div>
            <button className="btn btn-wide" onClick={pickExe}>
              <FolderOpen size={13} />
              Browse for llama-server
            </button>
            <div className={`path-display ${!exePath ? "empty" : ""}`}>
              {exePath || "No executable selected"}
            </div>
          </div>

          {/* Model selection */}
          <div className="card">
            <div className="card-header">
              <HardDrive size={14} className="icon" />
              <h3>Model Selection</h3>
              <span className="card-meta">{models.length} found</span>
            </div>

            {/* Scan directories */}
            <div style={{ marginBottom: 8 }}>
              <div className="dir-tags">
                {config.model_directories.map((dir) => (
                  <span key={dir} className="dir-tag">
                    <span>{dir.split(/[/\\]/).pop() || dir}</span>
                    <span
                      className="remove-dir"
                      onClick={() => removeModelDirectory(dir)}
                      title="Remove directory"
                    >
                      <X size={10} />
                    </span>
                  </span>
                ))}
              </div>
              <div className="flex-row">
                <button className="btn btn-sm" onClick={addModelDirectory}>
                  <Plus size={12} />
                  Add Scan Dir
                </button>
                {config.model_directories.length > 0 && (
                  <button className="btn btn-sm" onClick={rescanModels} disabled={scanInProgress}>
                    <RefreshCw size={11} className={scanInProgress ? "spin-icon" : ""} />
                    {scanInProgress ? "Scanning" : "Rescan"}
                  </button>
                )}
              </div>
            </div>

            {/* Model dropdown */}
            {models.length > 0 ? (
              <div className="select-wrapper">
                <select
                  className="select-model"
                  value={modelPath}
                  onChange={(e) => handleModelSelect(e.target.value)}
                >
                  <option value="">— Select a model —</option>
                  {hasSavedModelOutsideScan && (
                    <option value={modelPath}>
                      {savedModelFilename} (saved path)
                    </option>
                  )}
                  {models.map((m) => (
                    <option key={m.path} value={m.path}>
                      {m.filename} ({formatBytes(m.size_bytes)})
                    </option>
                  ))}
                </select>
                <span className="select-arrow">▼</span>
              </div>
            ) : (
              <p className="text-muted" style={{ fontSize: 11, marginTop: 6 }}>
                Add a scan directory or browse manually below.
              </p>
            )}

            {selectedModelInfo && (
              <div className="path-display" style={{ marginTop: 8 }}>
                {selectedModelInfo.filename} — {formatBytes(selectedModelInfo.size_bytes)}
              </div>
            )}

            <div style={{ marginTop: 8 }}>
              <button className="btn btn-sm" onClick={pickModel}>
                <FolderOpen size={12} />
                Browse for .gguf
              </button>
              {modelPath && !selectedModelInfo && (
                <div className="path-display" style={{ marginTop: 8 }}>
                  {modelPath}
                </div>
              )}
            </div>
          </div>

          {/* Presets */}
          <div className="card">
            <div className="card-header">
              <Zap size={14} className="icon" />
              <h3>Quick Presets</h3>
            </div>
            <div className="preset-grid">
              {Object.entries(PRESETS).map(([key, preset]) => (
                <div
                  key={key}
                  className={`preset-card tone-${preset.tone} ${selectedPreset === key ? "selected" : ""}`}
                  onClick={() => applyPreset(key)}
                >
                  <span className="preset-icon">{preset.icon}</span>
                  <div className="preset-info">
                    <div className="preset-title-row">
                      <div className="preset-name">{preset.name}</div>
                      <span className="preset-badge">{preset.badge}</span>
                    </div>
                    <div className="preset-desc">{preset.description}</div>
                    <div className="preset-specs">
                      <span>{preset.settings.ctxSize >= 1000 ? `${Math.round(preset.settings.ctxSize / 1024)}k ctx` : `${preset.settings.ctxSize} ctx`}</span>
                      <span>{preset.settings.temp.toFixed(2)} temp</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Start/Stop */}
          <div className="control-section">
            {!isRunning ? (
              <button
                className="btn btn-success btn-block"
                onClick={handleStart}
                disabled={!canStart}
              >
                {serverStatus === "starting" ? (
                  <>
                    <Loader size={16} style={{ animation: "spin 1s linear infinite" }} />
                    Starting...
                  </>
                ) : (
                  <>
                    <Play size={16} />
                    Start Server
                  </>
                )}
              </button>
            ) : (
              <button className="btn btn-danger btn-block" onClick={handleStop}>
                <Square size={16} />
                Stop Server
              </button>
            )}
            {isRunning && (
              <div className="control-info">
                <Wifi size={11} />
                <span>{endpoint}</span>
                <button className="icon-btn" onClick={copyEndpoint} title="Copy endpoint">
                  <Copy size={12} />
                </button>
              </div>
            )}
          </div>

          {/* Open WebUI */}
          <div className="card">
            <div className="card-header">
              <Globe size={14} className="icon" />
              <h3>Open WebUI</h3>
              <span className={`mini-status ${openWebuiStatus}`}>
                {openWebuiStatus === "running"
                  ? "Running"
                  : openWebuiStatus === "starting"
                    ? "Starting"
                    : openWebuiStatus === "error"
                      ? "Error"
                      : "Stopped"}
              </span>
            </div>

            <button className="btn btn-wide" onClick={pickOpenWebuiVenv}>
              <FolderOpen size={13} />
              Browse for venv
            </button>
            <div className={`path-display ${!openWebuiVenvPath ? "empty" : ""}`}>
              {openWebuiVenvPath || "No Open WebUI venv selected"}
            </div>

            <div className="compact-settings">
              <label>
                <span>Host</span>
                <input
                  type="text"
                  className="form-input"
                  value={openWebuiHost}
                  onChange={(e) => setOpenWebuiHost(e.target.value || "127.0.0.1")}
                />
              </label>
              <label>
                <span>Port</span>
                <input
                  type="number"
                  className="form-input small"
                  value={openWebuiPort}
                  min={1024}
                  max={65535}
                  onChange={(e) => setOpenWebuiPort(Number(e.target.value) || 3000)}
                />
              </label>
            </div>

            <div className="path-display">
              Backend: {openAiEndpoint}
            </div>

            <div className="split-actions">
              {!openWebuiRunning ? (
                <button
                  className="btn btn-success btn-block"
                  onClick={handleStartOpenWebui}
                  disabled={!canStartOpenWebui}
                >
                  {openWebuiStatus === "starting" ? (
                    <>
                      <Loader size={16} style={{ animation: "spin 1s linear infinite" }} />
                      Starting...
                    </>
                  ) : (
                    <>
                      <Play size={16} />
                      Start Open WebUI
                    </>
                  )}
                </button>
              ) : (
                <button className="btn btn-danger btn-block" onClick={handleStopOpenWebui}>
                  <Square size={16} />
                  Stop Open WebUI
                </button>
              )}
            </div>

            <div className="control-info compact">
              <Wifi size={11} />
              <span>{openWebuiEndpoint}</span>
              <button className="icon-btn" onClick={copyOpenWebuiEndpoint} title="Copy Open WebUI URL">
                <Copy size={12} />
              </button>
              <button className="icon-btn" onClick={copyOpenAiEndpoint} title="Copy llama.cpp /v1 endpoint">
                <Server size={12} />
              </button>
            </div>
          </div>
        </aside>

        {/* Right Panel */}
        <section className="right-panel">
          <div className="overview-grid">
            <div className={`metric-card ${statusTone}`}>
              <Activity size={16} />
              <span className="metric-label">Status</span>
              <strong>{statusLabel}</strong>
            </div>
            <div className="metric-card">
              <HardDrive size={16} />
              <span className="metric-label">Models</span>
              <strong>{models.length}</strong>
              <span className="metric-note">{formatBytes(totalModelBytes)}</span>
            </div>
            <div className="metric-card">
              <Server size={16} />
              <span className="metric-label">Endpoint</span>
              <strong className="metric-endpoint">{isRunning ? endpoint : "Not running"}</strong>
            </div>
            <div className={`metric-card ${openWebuiStatus === "running" ? "running" : openWebuiStatus === "error" ? "error" : openWebuiStatus === "starting" ? "starting" : ""}`}>
              <Globe size={16} />
              <span className="metric-label">Open WebUI</span>
              <strong className="metric-endpoint">{openWebuiRunning ? openWebuiEndpoint : "Not running"}</strong>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <SlidersHorizontal size={14} className="icon" />
              <h3>Server Settings</h3>
            </div>

            {/* Context Size */}
            <div className="form-row">
              <span className="form-label">Context Length</span>
              <input
                type="number"
                className="form-input small"
                value={ctxSize}
                min={256}
                max={131072}
                step={256}
                onChange={(e) => setCtxSize(Number(e.target.value) || 2048)}
              />
            </div>

            {/* Port */}
            <div className="form-row">
              <span className="form-label">Port</span>
              <input
                type="number"
                className="form-input small"
                value={port}
                min={1024}
                max={65535}
                onChange={(e) => setPort(Number(e.target.value) || 8080)}
              />
            </div>

            {/* Host */}
            <div className="form-row">
              <span className="form-label">Host</span>
              <input
                type="text"
                className="form-input"
                value={host}
                onChange={(e) => setHost(e.target.value || "127.0.0.1")}
              />
            </div>

            {/* Temperature */}
            <div className="form-row">
              <span className="form-label">Temperature</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.05}
                  value={temp}
                  onChange={(e) => setTemp(Number(e.target.value))}
                />
                <span style={{ width: 30, textAlign: "right", fontSize: 12, fontWeight: 600 }}>
                  {temp.toFixed(2)}
                </span>
              </div>
            </div>

            {/* GPU Layers */}
            <div className="form-row">
              <span className="form-label">GPU Layers (NGL)</span>
              <input
                type="number"
                className="form-input small"
                value={ngl}
                min={0}
                max={999}
                onChange={(e) => setNgl(Number(e.target.value) || 0)}
              />
              <span className="text-muted" style={{ fontSize: 10 }}>
                (0 = CPU only)
              </span>
            </div>

            {/* Main GPU */}
            <div className="form-row">
              <span className="form-label">Main GPU Device</span>
              <select
                className="form-input small"
                value={mainGpu ?? ""}
                onChange={(e) => setMainGpu(e.target.value === "" ? null : Number(e.target.value))}
              >
                <option value="">Auto-detect</option>
                <option value="0">GPU 0</option>
                <option value="1">GPU 1</option>
                <option value="2">GPU 2</option>
                <option value="3">GPU 3</option>
              </select>
            </div>

            {/* Tensor Split */}
            <div className="form-row">
              <span className="form-label">Tensor Split</span>
              <input
                type="text"
                className="form-input small"
                placeholder="e.g. 0.6,0.4"
                value={tensorSplit ?? ""}
                onChange={(e) => setTensorSplit(e.target.value || null)}
              />
              <span className="text-muted" style={{ fontSize: 10 }}>
                (multi-GPU only)
              </span>
            </div>

            {/* No Mmap */}
            <div className="toggle-row">
              <span className="form-label">No Memory Map</span>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={noMmap}
                  onChange={(e) => setNoMmap(e.target.checked)}
                />
                <span className="toggle-slider" />
              </label>
            </div>

            {/* No Web UI */}
            <div className="toggle-row">
              <span className="form-label">API Only (no Web UI)</span>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={noWebui}
                  onChange={(e) => setNoWebui(e.target.checked)}
                />
                <span className="toggle-slider" />
              </label>
            </div>

            {/* Threads */}
            <div className="form-row">
              <span className="form-label">CPU Threads</span>
              <input
                type="number"
                className="form-input small"
                value={threads}
                min={0}
                max={256}
                onChange={(e) => setThreads(Number(e.target.value) || 0)}
              />
              <span className="text-muted" style={{ fontSize: 10 }}>
                (0 = auto)
              </span>
            </div>

            {/* Batch Size */}
            <div className="form-row">
              <span className="form-label">Batch Size</span>
              <input
                type="number"
                className="form-input small"
                value={batchSize}
                min={64}
                max={4096}
                step={64}
                onChange={(e) => setBatchSize(Number(e.target.value) || 512)}
              />
            </div>

            {/* Top-P */}
            <div className="form-row">
              <span className="form-label">Top-P</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={topP}
                  onChange={(e) => setTopP(Number(e.target.value))}
                />
                <span style={{ width: 30, textAlign: "right", fontSize: 12, fontWeight: 600 }}>
                  {topP.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Top-K */}
            <div className="form-row">
              <span className="form-label">Top-K</span>
              <input
                type="number"
                className="form-input small"
                value={topK}
                min={1}
                max={200}
                onChange={(e) => setTopK(Number(e.target.value) || 40)}
              />
            </div>

            {/* Min-P */}
            <div className="form-row">
              <span className="form-label">Min-P</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="range"
                  min={0}
                  max={0.2}
                  step={0.01}
                  value={minP}
                  onChange={(e) => setMinP(Number(e.target.value))}
                />
                <span style={{ width: 30, textAlign: "right", fontSize: 12, fontWeight: 600 }}>
                  {minP.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Repeat Penalty */}
            <div className="form-row">
              <span className="form-label">Repeat Penalty</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="range"
                  min={1}
                  max={2}
                  step={0.01}
                  value={repeatPenalty}
                  onChange={(e) => setRepeatPenalty(Number(e.target.value))}
                />
                <span style={{ width: 30, textAlign: "right", fontSize: 12, fontWeight: 600 }}>
                  {repeatPenalty.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Presence Penalty */}
            <div className="form-row">
              <span className="form-label">Presence Penalty</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.05}
                  value={presencePenalty}
                  onChange={(e) => setPresencePenalty(Number(e.target.value))}
                />
                <span style={{ width: 30, textAlign: "right", fontSize: 12, fontWeight: 600 }}>
                  {presencePenalty.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Flash Attention */}
            <div className="toggle-row">
              <span className="form-label">Flash Attention</span>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={flashAttn}
                  onChange={(e) => setFlashAttn(e.target.checked)}
                />
                <span className="toggle-slider" />
              </label>
            </div>
          </div>

          {/* Status card */}
          <div className="card">
            <div className="card-header">
              {serverStatus === "running" ? (
                <CheckCircle size={14} style={{ color: "var(--success-text)" }} />
              ) : serverStatus === "error" ? (
                <AlertCircle size={14} style={{ color: "var(--danger-text)" }} />
              ) : (
                <Server size={14} className="icon" />
              )}
              <h3>Server Status</h3>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="text-muted">Status</span>
                <span
                  style={{
                    fontWeight: 600,
                    color:
                      serverStatus === "running"
                        ? "var(--success-text)"
                        : serverStatus === "error"
                          ? "var(--danger-text)"
                          : "var(--text-muted)",
                  }}
                >
                  {serverStatus === "running"
                    ? "Running"
                    : serverStatus === "starting"
                      ? "Starting..."
                      : serverStatus === "error"
                        ? "Error"
                        : "Stopped"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="text-muted">Model</span>
                <span>{selectedModelInfo?.filename || (modelPath ? modelPath.split(/[/\\]/).pop() : "—")}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="text-muted">Endpoint</span>
                <span style={{ fontFamily: "monospace", fontSize: 11 }}>
                  {isRunning ? `http://${host}:${port}` : "—"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="text-muted">Context</span>
                <span>{ctxSize.toLocaleString()} tokens</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="text-muted">GPU Layers</span>
                <span>{ngl}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="text-muted">Main GPU</span>
                <span>{mainGpu !== null ? `GPU ${mainGpu}` : "Auto"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="text-muted">Tensor Split</span>
                <span>{tensorSplit || "—"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="text-muted">Min-P</span>
                <span>{minP.toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="text-muted">Presence Penalty</span>
                <span>{presencePenalty.toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="text-muted">No Mmap</span>
                <span>{noMmap ? "On" : "Off"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="text-muted">Web UI</span>
                <span>{noWebui ? "Disabled" : "Enabled"}</span>
              </div>
            </div>
          </div>

          <LogPanel
            title="Server Log"
            icon={<Terminal size={14} className="icon" />}
            lines={serverLog}
            expanded={logExpanded}
            emptyText="No output yet. Start the server to see logs."
            endRef={logEndRef}
            onToggle={() => setLogExpanded((expanded) => !expanded)}
            onClear={() => {
              invoke("clear_server_log");
              setServerLog([]);
            }}
          />

          <LogPanel
            title="Open WebUI Log"
            icon={<Globe size={14} className="icon" />}
            lines={openWebuiLog}
            expanded={openWebuiLogExpanded}
            emptyText="No output yet. Start Open WebUI to see logs."
            endRef={openWebuiLogEndRef}
            onToggle={() => setOpenWebuiLogExpanded((expanded) => !expanded)}
            onClear={() => {
              invoke("clear_open_webui_log");
              setOpenWebuiLog([]);
            }}
          />
        </section>
      </div>
      ) : activeTab === "downloads" ? (
        <div className="downloads-content">
          <section className="downloads-grid">
            <div className="downloads-primary">
              {hfDownloadPanel}
            </div>

            <div className="downloads-secondary">
              <div className="card">
                <div className="card-header">
                  <HardDrive size={14} className="icon" />
                  <h3>Model Folders</h3>
                  <span className="card-meta">{config.model_directories.length} folders</span>
                </div>
                <div className="dir-tags model-folder-tags">
                  {config.model_directories.map((dir) => (
                    <span key={dir} className="dir-tag">
                      <span>{dir}</span>
                      <span
                        className="remove-dir"
                        onClick={() => removeModelDirectory(dir)}
                        title="Remove directory"
                      >
                        <X size={10} />
                      </span>
                    </span>
                  ))}
                </div>
                <div className="flex-row">
                  <button className="btn btn-sm" onClick={addModelDirectory}>
                    <Plus size={12} />
                    Add Folder
                  </button>
                  <button className="btn btn-sm" onClick={rescanModels} disabled={!config.model_directories.length || scanInProgress}>
                    <RefreshCw size={11} className={scanInProgress ? "spin-icon" : ""} />
                    {scanInProgress ? "Scanning" : "Rescan"}
                  </button>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <Download size={14} className="icon" />
                  <h3>Recent Downloads</h3>
                  {downloadHistory.length > 0 && (
                    <button className="btn btn-sm" style={{ marginLeft: "auto" }} onClick={clearDownloadHistory}>
                      Clear
                    </button>
                  )}
                </div>
                <div className="download-history">
                  {downloadHistory.length === 0 ? (
                    <span className="text-muted">Completed downloads will appear here.</span>
                  ) : (
                    downloadHistory.map((item) => (
                      <button
                        key={`${item.path}-${item.completed_at}`}
                        className={`history-row ${samePath(item.path, modelPath) ? "selected" : ""}`}
                        onClick={() => handleModelSelect(item.path)}
                      >
                        <span>{item.filename}</span>
                        <small>{item.repo}</small>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <Download size={14} className="icon" />
                  <h3>Download Options</h3>
                </div>
                <div className="download-option-list">
                  <div>
                    <strong>llama.cpp shorthand</strong>
                    <span>Use repo names like owner/model-GGUF:Q4_K_M.</span>
                  </div>
                  <div>
                    <strong>Gated models</strong>
                    <span>Add an HF token only when the repo needs license acceptance or private access.</span>
                  </div>
                  <div>
                    <strong>Local placement</strong>
                    <span>Downloads are saved directly into the selected model folder and selected after rescan.</span>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <HardDrive size={14} className="icon" />
                  <h3>Downloaded Models</h3>
                  <span className="card-meta">{models.length} found</span>
                </div>
                <div className="model-list-compact">
                  {models.length === 0 ? (
                    <span className="text-muted">No models scanned yet.</span>
                  ) : (
                    models.slice(0, 12).map((model) => (
                      <button
                        key={model.path}
                        className={`model-row ${samePath(model.path, modelPath) ? "selected" : ""}`}
                        onClick={() => handleModelSelect(model.path)}
                      >
                        <span>{model.filename}</span>
                        <strong>{formatBytes(model.size_bytes)}</strong>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : (
        <HelpPanel />
      )}

      {/* Toast */}
      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.type === "success" ? <CheckCircle size={14} style={{ marginRight: 6, verticalAlign: -2 }} /> : null}
          {toast.msg}
        </div>
      )}
    </div>
  );
}

export default App;
