import {
  Copy,
  Download,
  FolderOpen,
  Globe,
  Loader,
  Trash2,
  Play,
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
  updating: boolean;
  settingUp: boolean;
  onSetup: () => void;
  newVenvPath: string;
  canUseLlamaServerVenvParent: boolean;
  onPickVenvParent: () => void;
  onUseLlamaServerVenvParent: () => void;
  onPickVenv: () => void;
  onRemoveEnvironment: () => void;
  onHostChange: (host: string) => void;
  onPortChange: (port: number) => void;
  onStart: () => void;
  onStop: () => void;
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
  updating,
  settingUp,
  onSetup,
  newVenvPath,
  canUseLlamaServerVenvParent,
  onPickVenvParent,
  onUseLlamaServerVenvParent,
  onPickVenv,
  onRemoveEnvironment,
  onHostChange,
  onPortChange,
  onStart,
  onStop,
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

  const controlsDisabled = isRunning || updating || settingUp;

  return (
    <div className="card">
      <div className="card-header">
        <Globe size={14} className="icon" />
        <h3>Open WebUI</h3>
        <span className={`mini-status ${settingUp ? "starting" : status}`}>
          {settingUp ? "Setting up" : statusLabel}
        </span>
      </div>

      <button
        className="btn btn-wide btn-success"
        onClick={onSetup}
        disabled={isRunning || updating || settingUp}
      >
        {settingUp ? (
          <>
            <Loader size={13} style={{ animation: "spin 1s linear infinite" }} />
            Setting up Python and Open WebUI...
          </>
        ) : (
          <>
            <Download size={13} />
            Set up Open WebUI environment
          </>
        )}
      </button>
      <p className="text-muted" style={{ fontSize: 10, margin: "5px 0" }}>
        Creates a standard .venv beside llama-server or in your chosen parent folder using Python
        3.12. Existing environments are never overwritten. Other Python installs are left unchanged.
      </p>
      <div className="path-display">New environment location: {newVenvPath}</div>
      <div className="split-actions">
        <button className="btn btn-sm" onClick={onPickVenvParent} disabled={controlsDisabled}>
          <FolderOpen size={12} />
          Choose .venv location
        </button>
        <button
          className="btn btn-sm"
          onClick={onUseLlamaServerVenvParent}
          disabled={controlsDisabled || !canUseLlamaServerVenvParent}
        >
          Use llama-server folder
        </button>
      </div>

      <button className="btn btn-wide" onClick={onPickVenv} disabled={controlsDisabled}>
        <FolderOpen size={13} />
        Browse for existing venv
      </button>
      <div className={`path-display ${!venvPath ? "empty" : ""}`}>
        {venvPath || "No Open WebUI venv selected"}
      </div>
      {venvPath && (
        <button
          className="btn btn-wide btn-danger"
          onClick={onRemoveEnvironment}
          disabled={controlsDisabled}
        >
          <Trash2 size={13} />
          Delete selected .venv
        </button>
      )}

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
