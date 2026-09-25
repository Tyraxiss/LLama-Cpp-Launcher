import { Cpu, Download, FolderOpen, Globe, RefreshCw, Trash2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { buildRedactedDiagnostics } from "../utils/improvements.mjs";
import type {
  LlamaCppBackendOption,
  LlamaCppUpdateInfo,
  LlamaCppUpdateProgress,
  ResourceStats,
} from "../types";
import { LlamaCppUpdatePanel } from "./LlamaCppUpdatePanel";
import { OpenwebuiUpdatePanel } from "./OpenWebuiUpdatePanel";

interface SettingsPanelProps {
  exePath: string;
  openWebuiVenvPath: string;
  isServerRunning: boolean;
  isOpenWebuiRunning: boolean;
  llamaUpdateInfo: LlamaCppUpdateInfo | null;
  selectedBackend: string;
  backends: LlamaCppBackendOption[];
  llamaChecking: boolean;
  llamaUpdating: boolean;
  llamaProgress: LlamaCppUpdateProgress | null;
  llamaUpdateAvailable: boolean;
  canUpdateLlama: boolean;
  onLlamaBackendChange: (backend: string) => void;
  onLlamaCheck: () => void;
  onLlamaUpdate: () => void;
  openWebuiInstalledVersion: string | null;
  openWebuiLatestVersion: string | null;
  openWebuiUpdateAvailable: boolean;
  openWebuiUpdating: boolean;
  openWebuiSettingUp: boolean;
  newVenvPath: string;
  canUseLlamaServerVenvParent: boolean;
  onPickOpenWebuiVenvParent: () => void;
  onUseLlamaServerVenvParent: () => void;
  onRemoveOpenWebuiEnvironment: () => void;
  onOpenWebuiSetup: () => void;
  onOpenWebuiUpdate: () => void;
  onOpenWebuiRefreshVersion: () => void;
  diagnostics: {
    appVersion: string;
    llamaTag: string | null;
    llamaBackend: string | null;
    serverLog: string[];
    openWebuiLog: string[];
    resourceStats: ResourceStats | null;
  };
}

export function SettingsPanel({
  exePath,
  openWebuiVenvPath,
  isServerRunning,
  isOpenWebuiRunning,
  llamaUpdateInfo,
  selectedBackend,
  backends,
  llamaChecking,
  llamaUpdating,
  llamaProgress,
  llamaUpdateAvailable,
  canUpdateLlama,
  onLlamaBackendChange,
  onLlamaCheck,
  onLlamaUpdate,
  openWebuiInstalledVersion,
  openWebuiLatestVersion,
  openWebuiUpdateAvailable,
  openWebuiUpdating,
  openWebuiSettingUp,
  newVenvPath,
  canUseLlamaServerVenvParent,
  onPickOpenWebuiVenvParent,
  onUseLlamaServerVenvParent,
  onRemoveOpenWebuiEnvironment,
  onOpenWebuiSetup,
  onOpenWebuiUpdate,
  onOpenWebuiRefreshVersion,
  diagnostics,
}: SettingsPanelProps) {
  const exportDiagnostics = async () => {
    try {
      const report = buildRedactedDiagnostics({
        appVersion: diagnostics.appVersion,
        llamaTag: diagnostics.llamaTag,
        llamaBackend: diagnostics.llamaBackend,
        stats: diagnostics.resourceStats,
        serverLog: diagnostics.serverLog,
        openWebuiLog: diagnostics.openWebuiLog,
      });
      const saved = await invoke<boolean>("save_diagnostics", {
        contents: JSON.stringify(report, null, 2),
      });
      if (saved) window.alert("Redacted diagnostics saved.");
    } catch (error) {
      window.alert(`Could not export diagnostics: ${String(error)}`);
    }
  };
  return (
    <div className="settings-content">
      <div className="settings-intro">
        <RefreshCw size={16} className="icon" />
        <div>
          <h2>Updates</h2>
          <p className="text-muted">
            Keep llama.cpp and Open WebUI current without cluttering the Server workspace.
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <Download size={14} className="icon" />
          <h3>Diagnostics</h3>
        </div>
        <p className="text-muted">
          Export recent logs, app/build information, and hardware stats. Personal paths and secret
          fields are redacted before saving.
        </p>
        <button className="btn btn-sm" onClick={() => void exportDiagnostics()}>
          <Download size={12} />
          Export redacted diagnostics
        </button>
      </div>

      <div className="settings-grid">
        <div className="card">
          <div className="card-header">
            <Cpu size={14} className="icon" />
            <h3>llama.cpp</h3>
            {llamaUpdateAvailable && !llamaUpdating && (
              <span className="mini-status starting">Update available</span>
            )}
          </div>
          <div className={`path-display ${!exePath ? "empty" : ""}`}>
            {exePath || "No llama-server selected — pick one on the Server tab"}
          </div>
          <LlamaCppUpdatePanel
            exePath={exePath}
            isServerRunning={isServerRunning}
            updateInfo={llamaUpdateInfo}
            selectedBackend={selectedBackend}
            backends={backends}
            checking={llamaChecking}
            updating={llamaUpdating}
            progress={llamaProgress}
            updateAvailable={llamaUpdateAvailable}
            canUpdate={canUpdateLlama}
            onBackendChange={onLlamaBackendChange}
            onCheck={onLlamaCheck}
            onUpdate={onLlamaUpdate}
          />
        </div>

        <div className="card">
          <div className="card-header">
            <Globe size={14} className="icon" />
            <h3>Open WebUI</h3>
            {openWebuiUpdateAvailable && !openWebuiUpdating && (
              <span className="mini-status starting">Update available</span>
            )}
          </div>
          <div className={`path-display ${!openWebuiVenvPath ? "empty" : ""}`}>
            {openWebuiVenvPath ||
              "No Open WebUI venv selected — set one up or browse on the Server tab"}
          </div>
          <div className="path-display">New environment location: {newVenvPath}</div>
          <div className="split-actions">
            <button
              className="btn btn-sm"
              onClick={onPickOpenWebuiVenvParent}
              disabled={isOpenWebuiRunning || openWebuiUpdating || openWebuiSettingUp}
            >
              <FolderOpen size={12} />
              Choose .venv location
            </button>
            <button
              className="btn btn-sm"
              onClick={onUseLlamaServerVenvParent}
              disabled={
                isOpenWebuiRunning ||
                openWebuiUpdating ||
                openWebuiSettingUp ||
                !canUseLlamaServerVenvParent
              }
            >
              Use llama-server folder
            </button>
          </div>
          {openWebuiVenvPath && (
            <button
              className="btn btn-wide btn-danger"
              onClick={onRemoveOpenWebuiEnvironment}
              disabled={isOpenWebuiRunning || openWebuiUpdating || openWebuiSettingUp}
            >
              <Trash2 size={13} />
              Delete selected .venv
            </button>
          )}
          <OpenwebuiUpdatePanel
            venvPath={openWebuiVenvPath}
            settingUp={openWebuiSettingUp}
            onSetup={onOpenWebuiSetup}
            isRunning={isOpenWebuiRunning}
            installedVersion={openWebuiInstalledVersion}
            latestVersion={openWebuiLatestVersion}
            updateAvailable={openWebuiUpdateAvailable}
            updating={openWebuiUpdating}
            onUpdate={onOpenWebuiUpdate}
            onRefreshVersion={onOpenWebuiRefreshVersion}
          />
        </div>
      </div>
    </div>
  );
}
