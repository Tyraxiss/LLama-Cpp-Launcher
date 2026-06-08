import {
  Copy,
  FolderOpen,
  Globe,
  Loader,
  Play,
  RefreshCw,
  Server,
  Square,
  Wifi,
} from "lucide-react";
import type { ProcessStatus } from "../hooks/useLlamaServer";

interface OpenWebuiPanelProps {
  venvPath: string;
  host: string;
  port: number;
  openAiEndpoint: string;
  openWebuiEndpoint: string;
  status: ProcessStatus;
  isRunning: boolean;
  canStart: boolean;
  installedVersion: string | null;
  latestVersion: string | null;
  updateAvailable: boolean;
  updating: boolean;
  onPickVenv: () => void;
  onHostChange: (host: string) => void;
  onPortChange: (port: number) => void;
  onStart: () => void;
  onStop: () => void;
  onUpdate: () => void;
  onRefreshVersion: () => void;
  onCopyUrl: () => void;
  onCopyOpenAiEndpoint: () => void;
}

export function OpenWebuiPanel({
  venvPath,
  host,
  port,
  openAiEndpoint,
  openWebuiEndpoint,
  status,
  isRunning,
  canStart,
  installedVersion,
  latestVersion,
  updateAvailable,
  updating,
  onPickVenv,
  onHostChange,
  onPortChange,
  onStart,
  onStop,
  onUpdate,
  onRefreshVersion,
  onCopyUrl,
  onCopyOpenAiEndpoint,
}: OpenWebuiPanelProps) {
  const statusLabel =
    status === "running"
      ? "Running"
      : status === "starting"
        ? "Starting"
        : status === "error"
          ? "Error"
          : "Stopped";

  const controlsDisabled = isRunning || updating;

  return (
    <div className="card">
      <div className="card-header">
        <Globe size={14} className="icon" />
        <h3>Open WebUI</h3>
        <span className={`mini-status ${status}`}>{statusLabel}</span>
        {updateAvailable && !updating && (
          <span className="mini-status starting">Update available</span>
        )}
      </div>

      <button className="btn btn-wide" onClick={onPickVenv} disabled={updating}>
        <FolderOpen size={13} />
        Browse for venv
      </button>
      <div className={`path-display ${!venvPath ? "empty" : ""}`}>
        {venvPath || "No Open WebUI venv selected"}
      </div>

      <div className="open-webui-version-row">
        <div className="open-webui-version-text">
          <span>Installed: {installedVersion ? `v${installedVersion}` : "Unknown"}</span>
          {latestVersion ? <span>Latest: v{latestVersion}</span> : null}
        </div>
        <button
          className="btn btn-sm"
          onClick={() => onRefreshVersion()}
          disabled={!venvPath || updating}
          title="Refresh version info"
        >
          <RefreshCw size={11} />
        </button>
      </div>

      <button
        className="btn btn-wide"
        onClick={onUpdate}
        disabled={!venvPath || controlsDisabled}
      >
        {updating ? (
          <>
            <Loader size={13} style={{ animation: "spin 1s linear infinite" }} />
            Updating Open WebUI...
          </>
        ) : (
          <>
            <RefreshCw size={13} />
            {updateAvailable ? "Update Open WebUI" : "Reinstall / Update Open WebUI"}
          </>
        )}
      </button>

      <div className="compact-settings">
        <label>
          <span>Host</span>
          <input
            type="text"
            className="form-input"
            value={host}
            disabled={controlsDisabled}
            onChange={(e) => onHostChange(e.target.value || "127.0.0.1")}
          />
        </label>
        <label>
          <span>Port</span>
          <input
            type="number"
            className="form-input small"
            value={port}
            min={1024}
            max={65535}
            disabled={controlsDisabled}
            onChange={(e) => onPortChange(Number(e.target.value) || 3000)}
          />
        </label>
      </div>

      <div className="path-display">Backend: {openAiEndpoint}</div>

      <div className="split-actions">
        {!isRunning ? (
          <button className="btn btn-success btn-block" onClick={onStart} disabled={!canStart}>
            {status === "starting" ? (
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
          <button className="btn btn-danger btn-block" onClick={onStop}>
            <Square size={16} />
            Stop Open WebUI
          </button>
        )}
      </div>

      <div className="control-info compact">
        <Wifi size={11} />
        <span>{openWebuiEndpoint}</span>
        <button className="icon-btn" onClick={onCopyUrl} title="Copy Open WebUI URL">
          <Copy size={12} />
        </button>
        <button
          className="icon-btn"
          onClick={onCopyOpenAiEndpoint}
          title="Copy llama.cpp /v1 endpoint"
        >
          <Server size={12} />
        </button>
      </div>
    </div>
  );
}
