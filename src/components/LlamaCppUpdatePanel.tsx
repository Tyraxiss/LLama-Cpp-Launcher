import { Loader, RefreshCw } from "lucide-react";
import type { LlamaCppBackendOption, LlamaCppUpdateInfo, LlamaCppUpdateProgress } from "../types";
import { formatBytes } from "../utils/config";

interface LlamaCppUpdatePanelProps {
  exePath: string;
  isServerRunning: boolean;
  updateInfo: LlamaCppUpdateInfo | null;
  selectedBackend: string;
  backends: LlamaCppBackendOption[];
  checking: boolean;
  updating: boolean;
  progress: LlamaCppUpdateProgress | null;
  updateAvailable: boolean;
  canUpdate: boolean;
  onBackendChange: (backend: string) => void;
  onCheck: () => void;
  onUpdate: () => void;
}

export function LlamaCppUpdatePanel({
  exePath,
  isServerRunning,
  updateInfo,
  selectedBackend,
  backends,
  checking,
  updating,
  progress,
  updateAvailable,
  canUpdate,
  onBackendChange,
  onCheck,
  onUpdate,
}: LlamaCppUpdatePanelProps) {
  if (!exePath) {
    return (
      <p className="text-muted" style={{ fontSize: 12 }}>
        Select llama-server on the Server tab first.
      </p>
    );
  }

  const busy = checking || updating;
  const progressPercent =
    progress?.total_bytes && progress.total_bytes > 0
      ? Math.min(100, Math.round((progress.downloaded_bytes / progress.total_bytes) * 100))
      : null;

  return (
    <div className="update-panel-block">
      <div className="open-webui-version-row">
        <div className="open-webui-version-text">
          <span>Installed: {updateInfo?.installed_tag ? updateInfo.installed_tag : "Unknown"}</span>
          {updateInfo?.latest_tag ? <span>Latest: {updateInfo.latest_tag}</span> : null}
        </div>
        <button
          className="btn btn-sm"
          onClick={onCheck}
          disabled={busy}
          title="Check GitHub Releases for a newer llama.cpp build"
        >
          {checking ? (
            <Loader size={11} style={{ animation: "spin 1s linear infinite" }} />
          ) : (
            <RefreshCw size={11} />
          )}
        </button>
      </div>

      {updateAvailable && !updating && (
        <p className="text-muted" style={{ fontSize: 11, marginBottom: 8 }}>
          Update available for the selected backend.
        </p>
      )}

      {isServerRunning && (
        <p className="text-muted" style={{ fontSize: 11, marginBottom: 8 }}>
          Stop the server before updating llama.cpp.
        </p>
      )}

      <div className="form-row" style={{ marginBottom: 8 }}>
        <span className="form-label">Backend</span>
        <select
          className="form-input"
          value={selectedBackend}
          disabled={busy || backends.length === 0}
          onChange={(e) => onBackendChange(e.target.value)}
        >
          {backends.length === 0 ? (
            <option value="">Checking release assets...</option>
          ) : (
            backends.map((backend) => (
              <option key={backend.id} value={backend.id}>
                {backend.label}
                {backend.size_bytes ? ` (${formatBytes(backend.size_bytes)})` : ""}
              </option>
            ))
          )}
        </select>
      </div>

      <button
        className="btn btn-wide"
        onClick={onUpdate}
        disabled={!canUpdate || busy}
        title={
          isServerRunning
            ? "Stop llama-server before updating"
            : updateAvailable
              ? "Download and install the latest matching Windows build"
              : "Reinstall the latest matching Windows build"
        }
      >
        {updating ? (
          <>
            <Loader size={13} style={{ animation: "spin 1s linear infinite" }} />
            Updating llama.cpp...
          </>
        ) : (
          <>
            <RefreshCw size={13} />
            {updateAvailable ? "Update llama.cpp" : "Reinstall / Update llama.cpp"}
          </>
        )}
      </button>

      {progress && (
        <div className="llama-update-progress">
          <div className="text-muted" style={{ fontSize: 11, marginTop: 8 }}>
            {progress.message}
            {progress.filename ? ` (${progress.filename})` : ""}
          </div>
          {progressPercent !== null && (
            <div className="progress-track" style={{ marginTop: 6 }}>
              <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
            </div>
          )}
          {progress.total_bytes != null && (
            <div className="text-muted" style={{ fontSize: 10, marginTop: 4 }}>
              {formatBytes(progress.downloaded_bytes)} / {formatBytes(progress.total_bytes)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
