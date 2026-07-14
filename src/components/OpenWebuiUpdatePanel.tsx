import { Loader, RefreshCw } from "lucide-react";

interface OpenWebuiUpdatePanelProps {
  venvPath: string;
  isRunning: boolean;
  installedVersion: string | null;
  latestVersion: string | null;
  updateAvailable: boolean;
  updating: boolean;
  onUpdate: () => void;
  onRefreshVersion: () => void;
}

export function OpenWebuiUpdatePanel({
  venvPath,
  isRunning,
  installedVersion,
  latestVersion,
  updateAvailable,
  updating,
  onUpdate,
  onRefreshVersion,
}: OpenWebuiUpdatePanelProps) {
  if (!venvPath) {
    return (
      <p className="text-muted" style={{ fontSize: 12 }}>
        Select an Open WebUI venv on the Server tab first.
      </p>
    );
  }

  return (
    <div className="update-panel-block">
      <div className="open-webui-version-row">
        <div className="open-webui-version-text">
          <span>Installed: {installedVersion ? `v${installedVersion}` : "Unknown"}</span>
          {latestVersion ? <span>Latest: v{latestVersion}</span> : null}
        </div>
        <button
          className="btn btn-sm"
          onClick={() => onRefreshVersion()}
          disabled={updating}
          title="Refresh version info"
        >
          <RefreshCw size={11} />
        </button>
      </div>

      {updateAvailable && !updating && (
        <p className="text-muted" style={{ fontSize: 11, marginBottom: 8 }}>
          A newer open-webui release is available on PyPI.
        </p>
      )}

      {isRunning && (
        <p className="text-muted" style={{ fontSize: 11, marginBottom: 8 }}>
          Stop Open WebUI before updating.
        </p>
      )}

      <button
        className="btn btn-wide"
        onClick={onUpdate}
        disabled={isRunning || updating}
        title={
          isRunning
            ? "Stop Open WebUI before updating"
            : updating
              ? "Update in progress"
              : updateAvailable
                ? "Install the latest open-webui from PyPI"
                : "Reinstall or upgrade open-webui via pip"
        }
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
    </div>
  );
}
