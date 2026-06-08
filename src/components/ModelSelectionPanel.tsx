import { FolderOpen, HardDrive, Plus, RefreshCw, X } from "lucide-react";
import type { AppConfig, ModelInfo } from "../types";
import { formatBytes } from "../utils/config";

interface ModelSelectionPanelProps {
  config: AppConfig;
  models: ModelInfo[];
  modelPath: string;
  scanInProgress: boolean;
  onAddDirectory: () => void;
  onRemoveDirectory: (dir: string) => void;
  onRescan: () => void;
  onPickModel: () => void;
  onSelectModel: (path: string) => void;
}

export function ModelSelectionPanel({
  config,
  models,
  modelPath,
  scanInProgress,
  onAddDirectory,
  onRemoveDirectory,
  onRescan,
  onPickModel,
  onSelectModel,
}: ModelSelectionPanelProps) {
  const selectedModelInfo = models.find((model) => model.path === modelPath);
  const savedModelFilename = modelPath ? modelPath.split(/[/\\]/).pop() || modelPath : "";
  const hasSavedModelOutsideScan = Boolean(modelPath && !selectedModelInfo);

  return (
    <div className="card">
      <div className="card-header">
        <HardDrive size={14} className="icon" />
        <h3>Model Selection</h3>
        <span className="card-meta">{models.length} found</span>
      </div>

      <div style={{ marginBottom: 8 }}>
        <div className="dir-tags">
          {config.model_directories.map((dir) => (
            <span key={dir} className="dir-tag">
              <span>{dir.split(/[/\\]/).pop() || dir}</span>
              <span
                className="remove-dir"
                onClick={() => onRemoveDirectory(dir)}
                title="Remove directory"
              >
                <X size={10} />
              </span>
            </span>
          ))}
        </div>
        <div className="flex-row">
          <button className="btn btn-sm" onClick={onAddDirectory}>
            <Plus size={12} />
            Add Scan Dir
          </button>
          {config.model_directories.length > 0 && (
            <button className="btn btn-sm" onClick={onRescan} disabled={scanInProgress}>
              <RefreshCw size={11} className={scanInProgress ? "spin-icon" : ""} />
              {scanInProgress ? "Scanning" : "Rescan"}
            </button>
          )}
        </div>
      </div>

      {models.length > 0 ? (
        <div className="select-wrapper">
          <select
            className="select-model"
            value={modelPath}
            onChange={(e) => onSelectModel(e.target.value)}
          >
            <option value="">— Select a model —</option>
            {hasSavedModelOutsideScan && (
              <option value={modelPath}>{savedModelFilename} (saved path)</option>
            )}
            {models.map((model) => (
              <option key={model.path} value={model.path}>
                {model.filename} ({formatBytes(model.size_bytes)})
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
        <button className="btn btn-sm" onClick={onPickModel}>
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
  );
}
