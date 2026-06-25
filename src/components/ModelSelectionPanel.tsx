import { Eye, FolderOpen, HardDrive, Plus, RefreshCw, X } from "lucide-react";
import type { AppConfig, ModelInfo } from "../types";
import { formatBytes } from "../utils/config";

interface ModelSelectionPanelProps {
  config: AppConfig;
  models: ModelInfo[];
  mmprojs: ModelInfo[];
  modelPath: string;
  mmprojPath: string;
  scanInProgress: boolean;
  onAddDirectory: () => void;
  onRemoveDirectory: (dir: string) => void;
  onRescan: () => void;
  onPickModel: () => void;
  onPickMmproj: () => void;
  onSelectModel: (path: string) => void;
  onSelectMmproj: (path: string) => void;
}

export function ModelSelectionPanel({
  config,
  models,
  mmprojs,
  modelPath,
  mmprojPath,
  scanInProgress,
  onAddDirectory,
  onRemoveDirectory,
  onRescan,
  onPickModel,
  onPickMmproj,
  onSelectModel,
  onSelectMmproj,
}: ModelSelectionPanelProps) {
  const selectedModelInfo = models.find((model) => model.path === modelPath);
  const selectedMmprojInfo = mmprojs.find((mmproj) => mmproj.path === mmprojPath);
  const savedModelFilename = modelPath ? modelPath.split(/[/\\]/).pop() || modelPath : "";
  const savedMmprojFilename = mmprojPath ? mmprojPath.split(/[/\\]/).pop() || mmprojPath : "";
  const hasSavedModelOutsideScan = Boolean(modelPath && !selectedModelInfo);
  const hasSavedMmprojOutsideScan = Boolean(mmprojPath && !selectedMmprojInfo);

  return (
    <div className="card">
      <div className="card-header">
        <HardDrive size={14} className="icon" />
        <h3>Model Selection</h3>
        <span className="card-meta">{models.length} models</span>
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

      <div className="card-header" style={{ marginTop: 16, marginBottom: 8 }}>
        <Eye size={14} className="icon" />
        <h3>Vision Projector</h3>
        <span className="card-meta">{mmprojs.length} mmproj</span>
      </div>
      <p className="text-muted" style={{ fontSize: 11, marginBottom: 8 }}>
        Optional. Required for vision/multimodal models (LLaVA, Gemma 3 vision, etc.).
      </p>

      <div className="select-wrapper">
        <select
          className="select-model"
          value={mmprojPath}
          onChange={(e) => onSelectMmproj(e.target.value)}
        >
          <option value="">— None —</option>
          {hasSavedMmprojOutsideScan && (
            <option value={mmprojPath}>{savedMmprojFilename} (saved path)</option>
          )}
          {mmprojs.map((mmproj) => (
            <option key={mmproj.path} value={mmproj.path}>
              {mmproj.filename} ({formatBytes(mmproj.size_bytes)})
            </option>
          ))}
        </select>
        <span className="select-arrow">▼</span>
      </div>

      {selectedMmprojInfo && (
        <div className="path-display" style={{ marginTop: 8 }}>
          {selectedMmprojInfo.filename} — {formatBytes(selectedMmprojInfo.size_bytes)}
        </div>
      )}

      <div style={{ marginTop: 8 }}>
        <button className="btn btn-sm" onClick={onPickMmproj}>
          <FolderOpen size={12} />
          Browse for mmproj
        </button>
        {mmprojPath && !selectedMmprojInfo && (
          <div className="path-display" style={{ marginTop: 8 }}>
            {mmprojPath}
          </div>
        )}
      </div>
    </div>
  );
}
