import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { HfDownloadPanel } from "./components/HfDownloadPanel";
import { HelpPanel } from "./components/HelpPanel";
import { LogPanel } from "./components/LogPanel";
import { ModelSelectionPanel } from "./components/ModelSelectionPanel";
import { OpenWebuiPanel } from "./components/OpenWebuiPanel";
import { HeaderMemoryStats } from "./components/HeaderMemoryStats";
import { ServerSettingsPanel } from "./components/ServerSettingsPanel";
import { useHfDownload } from "./hooks/useHfDownload";
import { useLlamaServer } from "./hooks/useLlamaServer";
import { useModelLibrary } from "./hooks/useModelLibrary";
import { useOpenWebui } from "./hooks/useOpenWebui";
import { usePersistedConfig } from "./hooks/usePersistedConfig";
import { useResourceStats } from "./hooks/useResourceStats";
import { useToast } from "./hooks/useToast";
import { PRESETS } from "./presets";
import { THEME_OPTIONS, type ThemeId } from "./themes";
import type { ServerSettings } from "./types";
import { buildConfigSnapshot, formatBytes, samePath } from "./utils/config";
import {
  Zap,
  Play,
  Square,
  FolderOpen,
  Plus,
  X,
  CheckCircle,
  Loader,
  Cpu,
  HardDrive,
  Wifi,
  Copy,
  Activity,
  Server,
  Terminal,
  RefreshCw,
  Globe,
  Download,
  Palette,
  BookOpen,
} from "lucide-react";

function App() {
  const { toast, showToast } = useToast();
  const {
    config,
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
  } = usePersistedConfig();

  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"server" | "downloads" | "help">("server");
  const resourceStats = useResourceStats();

  const hf = useHfDownload({
    config,
    saveAppConfig,
    setModels,
    setMmprojs,
    setModelPath,
    setMmprojPath,
    showToast,
  });

  const modelLibrary = useModelLibrary({
    config,
    mmprojs,
    saveAppConfig,
    setModels,
    setMmprojs,
    setModelPath,
    setMmprojPath,
    hfTargetDir: hf.hfTargetDir,
    setHfTargetDir: hf.setHfTargetDir,
    showToast,
  });

  const server = useLlamaServer({
    exePath,
    modelPath,
    mmprojPath,
    serverSettings,
    buildCurrentConfig,
    saveAppConfig,
    showToast,
  });

  const openWebui = useOpenWebui({
    openWebuiVenvPath,
    openWebuiHost,
    openWebuiPort,
    serverSettings,
    buildCurrentConfig,
    saveAppConfig,
    showToast,
  });

  const pickExe = async () => {
    const selected = await open({
      multiple: false,
      title: "Select llama-server executable",
      filters: [{ name: "Executable", extensions: ["exe", "bin", "*"] }],
    });
    if (selected && typeof selected === "string") {
      setExePath(selected);
      await saveAppConfig({ ...config, exe_path: selected });
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
      await saveAppConfig({ ...config, open_webui_venv_path: selected });
    }
  };

  const applyPreset = async (key: string) => {
    const preset = PRESETS[key];
    if (!preset) return;
    const nextSettings: ServerSettings = {
      ...serverSettings,
      ctxSize: preset.settings.ctxSize,
      temp: preset.settings.temp,
      topP: preset.settings.topP,
      topK: preset.settings.topK,
      minP: preset.settings.minP,
      repeatPenalty: preset.settings.repeatPenalty,
      presencePenalty: preset.settings.presencePenalty,
      threads: preset.settings.threads,
      batchSize: preset.settings.batchSize,
      ngl: preset.settings.ngl ?? 99,
      mainGpu: preset.settings.mainGpu ?? null,
      tensorSplit: preset.settings.tensorSplit ?? null,
      noMmap: preset.settings.noMmap ?? false,
      noWebui: preset.settings.noWebui ?? false,
    };
    setServerSettings(nextSettings);
    setSelectedPreset(key);
    await saveAppConfig(buildConfigSnapshot(config, { server: nextSettings }));
    showToast(`${preset.name} preset applied`, "success");
  };

  const handleThemeChange = async (nextTheme: ThemeId) => {
    setTheme(nextTheme);
    await saveAppConfig({ ...config, last_theme: nextTheme });
  };

  const totalModelBytes = models.reduce((sum, model) => sum + model.size_bytes, 0);
  const statusTone =
    server.serverStatus === "running"
      ? "running"
      : server.serverStatus === "error"
        ? "error"
        : server.serverStatus === "starting"
          ? "starting"
          : "";
  const statusLabel =
    server.serverStatus === "running"
      ? `Running on ${serverSettings.port}`
      : server.serverStatus === "starting"
        ? "Starting..."
        : server.serverStatus === "error"
          ? "Connection lost"
          : "Stopped";

  const selectedModelInfo = models.find((m) => m.path === modelPath);

  const hfDownloadPanel = (
    <HfDownloadPanel
      repo={hf.hfRepo}
      token={hf.hfToken}
      files={hf.hfFiles}
      selectedFilePath={hf.hfSelectedFile}
      targetDir={hf.hfTargetDir}
      targetDirs={config.model_directories}
      loadingFiles={hf.hfLoadingFiles}
      downloading={hf.hfDownloading}
      queue={hf.downloadQueue}
      progress={hf.hfProgress}
      partialDownload={hf.hfPartialDownload}
      canResume={hf.canResume}
      formatBytes={formatBytes}
      onRepoChange={hf.setHfRepo}
      onTokenChange={hf.setHfToken}
      onSelectedFileChange={hf.setHfSelectedFile}
      onTargetDirChange={hf.setHfTargetDir}
      onLookupFiles={hf.lookupHfFiles}
      onBrowseTargetDir={hf.browseHfTargetDir}
      onEnqueueDownload={hf.enqueueHfDownload}
      onRemoveQueued={hf.removeQueuedDownload}
      onRetryQueued={hf.retryQueuedDownload}
      onClearFinishedQueue={hf.clearFinishedQueue}
      onCancelDownload={hf.cancelHfDownload}
      onDiscardPartial={hf.discardHfPartial}
    />
  );

  return (
    <div className="app-container" data-theme={theme}>
      <header className="header">
        <div className="header-left">
          <span className="header-logo">🦙</span>
          <div>
            <span className="header-title">LLama C++ Launcher</span>
            <span className="header-subtitle">local llama.cpp server control</span>
          </div>
          <span className="header-badge">v{__APP_VERSION__}</span>
        </div>
        <div className="header-center">
          <HeaderMemoryStats
            stats={resourceStats}
            isRunning={server.isRunning}
            serverStatus={server.serverStatus}
          />
        </div>
        <div className="header-right">
          <label className="theme-select" title="Theme">
            <Palette size={14} />
            <select value={theme} onChange={(e) => handleThemeChange(e.target.value as ThemeId)}>
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
          {hf.hfQueueActive && <span className="tab-dot" />}
        </button>
        <button
          className={`tab-button ${activeTab === "help" ? "active" : ""}`}
          onClick={() => setActiveTab("help")}
        >
          <BookOpen size={14} />
          Help
        </button>
      </nav>

      {activeTab === "server" ? (
        <div className="main-content">
          <aside className="left-panel">
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

            <ModelSelectionPanel
              config={config}
              models={models}
              mmprojs={mmprojs}
              modelPath={modelPath}
              mmprojPath={mmprojPath}
              scanInProgress={modelLibrary.scanInProgress}
              onAddDirectory={modelLibrary.addModelDirectory}
              onRemoveDirectory={modelLibrary.removeModelDirectory}
              onRescan={modelLibrary.rescanModels}
              onPickModel={modelLibrary.pickModel}
              onPickMmproj={modelLibrary.pickMmproj}
              onSelectModel={modelLibrary.handleModelSelect}
              onSelectMmproj={modelLibrary.handleMmprojSelect}
            />

            <div className="card">
              <div className="card-header">
                <Zap size={14} className="icon" />
                <h3>Use-Case Presets</h3>
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
                        <span>
                          {preset.settings.ctxSize >= 1000
                            ? `${Math.round(preset.settings.ctxSize / 1024)}k ctx`
                            : `${preset.settings.ctxSize} ctx`}
                        </span>
                        <span>{preset.settings.temp.toFixed(2)} temp</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="control-section">
              {!server.isRunning ? (
                <button
                  className="btn btn-success btn-block"
                  onClick={server.handleStart}
                  disabled={!server.canStart}
                >
                  {server.serverStatus === "starting" ? (
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
                <button className="btn btn-danger btn-block" onClick={server.handleStop}>
                  <Square size={16} />
                  Stop Server
                </button>
              )}
              {server.isRunning && (
                <div className="control-info">
                  <Wifi size={11} />
                  <span>{server.endpoint}</span>
                  <button className="icon-btn" onClick={server.copyEndpoint} title="Copy endpoint">
                    <Copy size={12} />
                  </button>
                </div>
              )}
            </div>

            <OpenWebuiPanel
              venvPath={openWebuiVenvPath}
              host={openWebuiHost}
              port={openWebuiPort}
              openAiEndpoint={server.openAiEndpoint}
              openWebuiEndpoint={openWebui.openWebuiEndpoint}
              status={openWebui.openWebuiStatus}
              isRunning={openWebui.openWebuiRunning}
              canStart={openWebui.canStart}
              installedVersion={openWebui.openWebuiVersion}
              latestVersion={openWebui.openWebuiLatestVersion}
              updateAvailable={openWebui.updateAvailable}
              updating={openWebui.openWebuiUpdating}
              onPickVenv={pickOpenWebuiVenv}
              onHostChange={setOpenWebuiHost}
              onPortChange={setOpenWebuiPort}
              onStart={openWebui.handleStart}
              onStop={openWebui.handleStop}
              onUpdate={openWebui.handleUpdate}
              onRefreshVersion={openWebui.refreshOpenWebuiVersions}
              onCopyUrl={openWebui.copyOpenWebuiEndpoint}
              onCopyOpenAiEndpoint={server.copyOpenAiEndpoint}
            />
          </aside>

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
                <strong className="metric-endpoint">
                  {server.isRunning ? server.endpoint : "Not running"}
                </strong>
              </div>
              <div
                className={`metric-card ${openWebui.openWebuiStatus === "running" ? "running" : openWebui.openWebuiStatus === "error" ? "error" : openWebui.openWebuiStatus === "starting" ? "starting" : ""}`}
              >
                <Globe size={16} />
                <span className="metric-label">Open WebUI</span>
                <strong className="metric-endpoint">
                  {openWebui.openWebuiRunning ? openWebui.openWebuiEndpoint : "Not running"}
                </strong>
              </div>
            </div>

            <ServerSettingsPanel
              settings={serverSettings}
              serverStatus={server.serverStatus}
              isRunning={server.isRunning}
              modelPath={modelPath}
              selectedModelFilename={
                selectedModelInfo?.filename ||
                (modelPath ? modelPath.split(/[/\\]/).pop() || modelPath : "")
              }
              onChange={(patch) => setServerSettings((current) => ({ ...current, ...patch }))}
            />

            <LogPanel
              title="Server Log"
              icon={<Terminal size={14} className="icon" />}
              lines={server.serverLog}
              expanded={server.logExpanded}
              emptyText="No output yet. Start the server to see logs."
              endRef={server.logEndRef}
              onToggle={() => server.setLogExpanded((expanded) => !expanded)}
              onClear={server.clearServerLog}
            />

            <LogPanel
              title="Open WebUI Log"
              icon={<Globe size={14} className="icon" />}
              lines={openWebui.openWebuiLog}
              expanded={openWebui.openWebuiLogExpanded}
              emptyText="No output yet. Start Open WebUI to see logs."
              endRef={openWebui.openWebuiLogEndRef}
              onToggle={() => openWebui.setOpenWebuiLogExpanded((expanded) => !expanded)}
              onClear={openWebui.clearOpenWebuiLog}
            />
          </section>
        </div>
      ) : activeTab === "downloads" ? (
        <div className="downloads-content">
          <section className="downloads-grid">
            <div className="downloads-primary">{hfDownloadPanel}</div>

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
                        onClick={() => modelLibrary.removeModelDirectory(dir)}
                        title="Remove directory"
                      >
                        <X size={10} />
                      </span>
                    </span>
                  ))}
                </div>
                <div className="flex-row">
                  <button className="btn btn-sm" onClick={modelLibrary.addModelDirectory}>
                    <Plus size={12} />
                    Add Folder
                  </button>
                  <button
                    className="btn btn-sm"
                    onClick={modelLibrary.rescanModels}
                    disabled={!config.model_directories.length || modelLibrary.scanInProgress}
                  >
                    <RefreshCw
                      size={11}
                      className={modelLibrary.scanInProgress ? "spin-icon" : ""}
                    />
                    {modelLibrary.scanInProgress ? "Scanning" : "Rescan"}
                  </button>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <Download size={14} className="icon" />
                  <h3>Recent Downloads</h3>
                  {hf.downloadHistory.length > 0 && (
                    <button
                      className="btn btn-sm"
                      style={{ marginLeft: "auto" }}
                      onClick={hf.clearDownloadHistory}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="download-history">
                  {hf.downloadHistory.length === 0 ? (
                    <span className="text-muted">Completed downloads will appear here.</span>
                  ) : (
                    hf.downloadHistory.map((item) => (
                      <button
                        key={`${item.path}-${item.completed_at}`}
                        className={`history-row ${samePath(item.path, modelPath) ? "selected" : ""}`}
                        onClick={() => modelLibrary.handleModelSelect(item.path)}
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
                    <span>
                      Add an HF token only when the repo needs license acceptance or private access.
                    </span>
                  </div>
                  <div>
                    <strong>Resume downloads</strong>
                    <span>
                      Cancelled or interrupted downloads keep a partial file — click Resume Download
                      to continue.
                    </span>
                  </div>
                  <div>
                    <strong>Local placement</strong>
                    <span>
                      Downloads are saved directly into the selected model folder and selected after
                      rescan.
                    </span>
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
                        onClick={() => modelLibrary.handleModelSelect(model.path)}
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

      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.type === "success" ? (
            <CheckCircle size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
          ) : null}
          {toast.msg}
        </div>
      )}
    </div>
  );
}

export default App;
