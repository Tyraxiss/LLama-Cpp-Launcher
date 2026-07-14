import { Cpu, Globe, RefreshCw } from "lucide-react";
import type { LlamaCppBackendOption, LlamaCppUpdateInfo, LlamaCppUpdateProgress } from "../types";
import { LlamaCppUpdatePanel } from "./LlamaCppUpdatePanel";
import { OpenWebuiUpdatePanel } from "./OpenWebuiUpdatePanel";

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
  onOpenWebuiUpdate: () => void;
  onOpenWebuiRefreshVersion: () => void;
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
  onOpenWebuiUpdate,
  onOpenWebuiRefreshVersion,
}: SettingsPanelProps) {
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
            {openWebuiVenvPath || "No Open WebUI venv selected — pick one on the Server tab"}
          </div>
          <OpenWebuiUpdatePanel
            venvPath={openWebuiVenvPath}
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
