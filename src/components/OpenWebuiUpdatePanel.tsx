import { Download, Loader, RefreshCw } from "lucide-react";

interface OpenwebuiUpdatePanelProps {
  venvPath: string;
  isRunning: boolean;
  installedVersion: string | null;
  latestVersion: string | null;
  updateAvailable: boolean;
  updating: boolean;
  settingUp: boolean;
  onSetup: () => void;
  onUpdate: () => void;
  onRefreshVersion: () => void;
}

export function OpenwebuiUpdatePanel({
  venvPath,
  isRunning,
  installedVersion,
  latestVersion,
  updateAvailable,
  updating,
  settingUp,
  onSetup,
  onUpdate,
  onRefreshVersion,
}: OpenwebuiUpdatePanelProps) {
  return (
    <div className="update-panel-block">
      <button
        className="btn btn-wide btn-success"
        onClick={onSetup}
        disabled={isRunning || updating || settingUp}
      >
        {settingUp ? (
          <>
            <Loader size={13} style={{ animation: "spin 1s linear infinite" }} />
            Setting up environment...
          </>
        ) : (
          <>
            <Download size={13} />
            Set up Open WebUI environment
          </>
        )}
      </button>
      <p className="text-muted" style={{ fontSize: 11 }}>
        Creates a standard .venv beside llama-server or in your chosen parent folder using Python
        3.12. Existing environments are never overwritten. Windows setup can install a separate
        Python 3.12 runtime without replacing other Python installations.
      </p>

      {venvPath ? (
        <>
          <div className="open-webui-version-row">
            <div className="open-webui-version-text">
              <span>Installed: {installedVersion ? `v${installedVersion}` : "Unknown"}</span>
              {latestVersion ? <span>Latest: v{latestVersion}</span> : null}
            </div>
            <button
              className="btn btn-sm"
              onClick={() => onRefreshVersion()}
              disabled={updating || settingUp}
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
            disabled={isRunning || updating || settingUp}
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
        </>
      ) : (
        <p className="text-muted" style={{ fontSize: 12 }}>
          The setup button creates the environment and installs Open WebUI for you.
        </p>
      )}
    </div>
  );
}
