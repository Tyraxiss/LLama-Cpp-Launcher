import { SlidersHorizontal } from "lucide-react";
import type { ServerSettings } from "../types";

interface ServerSettingsPanelProps {
  settings: ServerSettings;
  serverStatus: "stopped" | "starting" | "running" | "error";
  isRunning: boolean;
  modelPath: string;
  selectedModelFilename: string;
  onChange: (patch: Partial<ServerSettings>) => void;
}

export function ServerSettingsPanel({
  settings,
  serverStatus,
  isRunning,
  modelPath,
  selectedModelFilename,
  onChange,
}: ServerSettingsPanelProps) {
  const {
    ctxSize,
    port,
    host,
    temp,
    ngl,
    mainGpu,
    tensorSplit,
    noMmap,
    noWebui,
    threads,
    batchSize,
    topP,
    topK,
    minP,
    repeatPenalty,
    presencePenalty,
    flashAttn,
  } = settings;

  const statusLabel =
    serverStatus === "running"
      ? "Running"
      : serverStatus === "starting"
        ? "Starting..."
        : serverStatus === "error"
          ? "Error"
          : "Stopped";

  const settingsLocked = isRunning;

  return (
    <>
      <div className="card">
        <div className="card-header">
          <SlidersHorizontal size={14} className="icon" />
          <h3>Server Settings</h3>
        </div>

        {settingsLocked && (
          <p className="text-muted" style={{ fontSize: 11, marginBottom: 8 }}>
            Stop the server to change settings.
          </p>
        )}

        <div className="form-row">
          <span className="form-label">Context Length</span>
          <input
            type="number"
            className="form-input small"
            value={ctxSize}
            min={256}
            max={131072}
            step={256}
            disabled={settingsLocked}
            onChange={(e) => onChange({ ctxSize: Number(e.target.value) || 2048 })}
          />
        </div>

        <div className="form-row">
          <span className="form-label">Port</span>
          <input
            type="number"
            className="form-input small"
            value={port}
            min={1024}
            max={65535}
            disabled={settingsLocked}
            onChange={(e) => onChange({ port: Number(e.target.value) || 8080 })}
          />
        </div>

        <div className="form-row">
          <span className="form-label">Host</span>
          <input
            type="text"
            className="form-input"
            value={host}
            disabled={settingsLocked}
            onChange={(e) => onChange({ host: e.target.value || "127.0.0.1" })}
          />
        </div>

        <div className="form-row">
          <span className="form-label">Temperature</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={temp}
              disabled={settingsLocked}
              onChange={(e) => onChange({ temp: Number(e.target.value) })}
            />
            <span style={{ width: 30, textAlign: "right", fontSize: 12, fontWeight: 600 }}>
              {temp.toFixed(2)}
            </span>
          </div>
        </div>

        <div className="form-row">
          <span className="form-label">GPU Layers (NGL)</span>
          <input
            type="number"
            className="form-input small"
            value={ngl}
            min={0}
            max={999}
            disabled={settingsLocked}
            onChange={(e) => onChange({ ngl: Number(e.target.value) || 0 })}
          />
          <span className="text-muted" style={{ fontSize: 10 }}>
            (0 = CPU only)
          </span>
        </div>

        <div className="form-row">
          <span className="form-label">Main GPU Device</span>
          <select
            className="form-input small"
            value={mainGpu ?? ""}
            disabled={settingsLocked}
            onChange={(e) =>
              onChange({ mainGpu: e.target.value === "" ? null : Number(e.target.value) })
            }
          >
            <option value="">Auto-detect</option>
            <option value="0">GPU 0</option>
            <option value="1">GPU 1</option>
            <option value="2">GPU 2</option>
            <option value="3">GPU 3</option>
          </select>
        </div>

        <div className="form-row">
          <span className="form-label">Tensor Split</span>
          <input
            type="text"
            className="form-input small"
            placeholder="e.g. 0.6,0.4"
            value={tensorSplit ?? ""}
            disabled={settingsLocked}
            onChange={(e) => onChange({ tensorSplit: e.target.value || null })}
          />
          <span className="text-muted" style={{ fontSize: 10 }}>
            (multi-GPU only)
          </span>
        </div>

        <div className="toggle-row">
          <span className="form-label">No Memory Map</span>
          <label className="toggle">
            <input
              type="checkbox"
              checked={noMmap}
              disabled={settingsLocked}
              onChange={(e) => onChange({ noMmap: e.target.checked })}
            />
            <span className="toggle-slider" />
          </label>
        </div>

        <div className="toggle-row">
          <span className="form-label">API Only (no Web UI)</span>
          <label className="toggle">
            <input
              type="checkbox"
              checked={noWebui}
              disabled={settingsLocked}
              onChange={(e) => onChange({ noWebui: e.target.checked })}
            />
            <span className="toggle-slider" />
          </label>
        </div>

        <div className="form-row">
          <span className="form-label">CPU Threads</span>
          <input
            type="number"
            className="form-input small"
            value={threads}
            min={0}
            max={256}
            disabled={settingsLocked}
            onChange={(e) => onChange({ threads: Number(e.target.value) || 0 })}
          />
          <span className="text-muted" style={{ fontSize: 10 }}>
            (0 = auto)
          </span>
        </div>

        <div className="form-row">
          <span className="form-label">Batch Size</span>
          <input
            type="number"
            className="form-input small"
            value={batchSize}
            min={64}
            max={4096}
            step={64}
            disabled={settingsLocked}
            onChange={(e) => onChange({ batchSize: Number(e.target.value) || 512 })}
          />
        </div>

        <div className="form-row">
          <span className="form-label">Top-P</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={topP}
              disabled={settingsLocked}
              onChange={(e) => onChange({ topP: Number(e.target.value) })}
            />
            <span style={{ width: 30, textAlign: "right", fontSize: 12, fontWeight: 600 }}>
              {topP.toFixed(2)}
            </span>
          </div>
        </div>

        <div className="form-row">
          <span className="form-label">Top-K</span>
          <input
            type="number"
            className="form-input small"
            value={topK}
            min={1}
            max={200}
            disabled={settingsLocked}
            onChange={(e) => onChange({ topK: Number(e.target.value) || 40 })}
          />
        </div>

        <div className="form-row">
          <span className="form-label">Min-P</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="range"
              min={0}
              max={0.2}
              step={0.01}
              value={minP}
              disabled={settingsLocked}
              onChange={(e) => onChange({ minP: Number(e.target.value) })}
            />
            <span style={{ width: 30, textAlign: "right", fontSize: 12, fontWeight: 600 }}>
              {minP.toFixed(2)}
            </span>
          </div>
        </div>

        <div className="form-row">
          <span className="form-label">Repeat Penalty</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="range"
              min={1}
              max={2}
              step={0.01}
              value={repeatPenalty}
              disabled={settingsLocked}
              onChange={(e) => onChange({ repeatPenalty: Number(e.target.value) })}
            />
            <span style={{ width: 30, textAlign: "right", fontSize: 12, fontWeight: 600 }}>
              {repeatPenalty.toFixed(2)}
            </span>
          </div>
        </div>

        <div className="form-row">
          <span className="form-label">Presence Penalty</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={presencePenalty}
              disabled={settingsLocked}
              onChange={(e) => onChange({ presencePenalty: Number(e.target.value) })}
            />
            <span style={{ width: 30, textAlign: "right", fontSize: 12, fontWeight: 600 }}>
              {presencePenalty.toFixed(2)}
            </span>
          </div>
        </div>

        <div className="toggle-row">
          <span className="form-label">Flash Attention</span>
          <label className="toggle">
            <input
              type="checkbox"
              checked={flashAttn}
              disabled={settingsLocked}
              onChange={(e) => onChange({ flashAttn: e.target.checked })}
            />
            <span className="toggle-slider" />
          </label>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Server Status</h3>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span className="text-muted">Status</span>
            <span style={{ fontWeight: 600 }}>{statusLabel}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span className="text-muted">Model</span>
            <span>{selectedModelFilename || "—"}</span>
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
          {modelPath && (
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span className="text-muted">Path</span>
              <span style={{ fontSize: 10 }}>{modelPath.split(/[/\\]/).pop()}</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
