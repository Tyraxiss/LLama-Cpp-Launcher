import { useMemo, useState } from "react";
import { Download, FileSearch, FolderOpen, KeyRound, Loader, Search, X } from "lucide-react";

interface HfGgufFile {
  path: string;
  filename: string;
  size_bytes: number | null;
}

interface HfDownloadProgress {
  repo: string;
  filename: string;
  target_path: string;
  downloaded_bytes: number;
  total_bytes: number | null;
  status: "downloading" | "complete" | "cancelled" | "error";
  error: string | null;
}

interface HfDownloadPanelProps {
  repo: string;
  token: string;
  files: HfGgufFile[];
  selectedFilePath: string;
  targetDir: string;
  targetDirs: string[];
  loadingFiles: boolean;
  downloading: boolean;
  progress: HfDownloadProgress | null;
  formatBytes: (bytes: number) => string;
  onRepoChange: (value: string) => void;
  onTokenChange: (value: string) => void;
  onSelectedFileChange: (value: string) => void;
  onTargetDirChange: (value: string) => void;
  onLookupFiles: () => void;
  onBrowseTargetDir: () => void;
  onStartDownload: () => void;
  onCancelDownload: () => void;
}

export function HfDownloadPanel({
  repo,
  token,
  files,
  selectedFilePath,
  targetDir,
  targetDirs,
  loadingFiles,
  downloading,
  progress,
  formatBytes,
  onRepoChange,
  onTokenChange,
  onSelectedFileChange,
  onTargetDirChange,
  onLookupFiles,
  onBrowseTargetDir,
  onStartDownload,
  onCancelDownload,
}: HfDownloadPanelProps) {
  const [fileFilter, setFileFilter] = useState("");
  const [sortMode, setSortMode] = useState<"name" | "small" | "large">("name");
  const selectedFile = files.find((file) => file.path === selectedFilePath);
  const visibleFiles = useMemo(() => {
    const needle = fileFilter.trim().toLowerCase();
    const filtered = needle
      ? files.filter((file) => file.filename.toLowerCase().includes(needle) || file.path.toLowerCase().includes(needle))
      : files;
    return [...filtered].sort((a, b) => {
      if (sortMode === "small") return (a.size_bytes ?? Number.MAX_SAFE_INTEGER) - (b.size_bytes ?? Number.MAX_SAFE_INTEGER);
      if (sortMode === "large") return (b.size_bytes ?? 0) - (a.size_bytes ?? 0);
      return a.filename.toLowerCase().localeCompare(b.filename.toLowerCase());
    });
  }, [fileFilter, files, sortMode]);
  const progressPercent =
    progress?.total_bytes && progress.total_bytes > 0
      ? Math.min(100, Math.round((progress.downloaded_bytes / progress.total_bytes) * 100))
      : null;

  return (
    <div className="card">
      <div className="card-header">
        <Download size={14} className="icon" />
        <h3>Hugging Face</h3>
        {downloading && <span className="mini-status starting">Downloading</span>}
      </div>

      <div className="hf-stack">
        <div className="download-step">
          <span className="step-index">1</span>
          <input
            className="form-input hf-input"
            placeholder="owner/model-GGUF:Q4_K_M"
            type="text"
            value={repo}
            disabled={downloading}
            onChange={(e) => onRepoChange(e.target.value)}
          />
        </div>
        <div className="example-chips">
          {["unsloth/gemma-4-26B-A4B-it-GGUF:UD-Q2_K_XL", "bartowski/Qwen2.5-Coder-7B-Instruct-GGUF:Q4_K_M"].map((example) => (
            <button
              key={example}
              className="example-chip"
              disabled={downloading}
              onClick={() => onRepoChange(example)}
            >
              {example.split("/")[1]}
            </button>
          ))}
        </div>

        <div className="download-step">
          <span className="step-index optional">2</span>
          <div className="hf-token-row">
            <KeyRound size={12} />
            <input
              type="password"
              className="form-input hf-input"
              placeholder="HF token for gated/private models"
              value={token}
              disabled={downloading}
              onChange={(e) => onTokenChange(e.target.value)}
            />
          </div>
        </div>

        <button
          className="btn btn-wide"
          onClick={onLookupFiles}
          disabled={loadingFiles || downloading}
        >
          {loadingFiles ? (
            <>
              <Loader size={13} style={{ animation: "spin 1s linear infinite" }} />
              Looking up files
            </>
          ) : (
            <>
              <Search size={13} />
              Find GGUF Files
            </>
          )}
        </button>

        {files.length > 0 && (
          <div className="file-picker-panel">
            <div className="file-tools">
              <div className="file-filter">
                <FileSearch size={13} />
                <input
                  className="form-input hf-input"
                  placeholder="Filter by quant or filename"
                  value={fileFilter}
                  disabled={downloading}
                  onChange={(e) => setFileFilter(e.target.value)}
                />
              </div>
              <select
                className="form-input small sort-select"
                value={sortMode}
                disabled={downloading}
                onChange={(e) => setSortMode(e.target.value as "name" | "small" | "large")}
              >
                <option value="name">Name</option>
                <option value="small">Small</option>
                <option value="large">Large</option>
              </select>
            </div>

            <div className="file-list">
              {visibleFiles.length === 0 ? (
                <span className="text-muted">No GGUF files match that filter.</span>
              ) : (
                visibleFiles.slice(0, 24).map((file) => (
                  <button
                    key={file.path}
                    className={`hf-file-row ${file.path === selectedFilePath ? "selected" : ""}`}
                    disabled={downloading}
                    onClick={() => onSelectedFileChange(file.path)}
                  >
                    <span>{file.filename}</span>
                    <strong>{file.size_bytes ? formatBytes(file.size_bytes) : "size unknown"}</strong>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        <div className="download-step">
          <span className="step-index">3</span>
          <div className="hf-target-row">
            <select
              className="select-model"
              value={targetDir}
              disabled={downloading}
              onChange={(e) => onTargetDirChange(e.target.value)}
            >
              <option value="">Select model folder</option>
              {targetDirs.map((dir) => (
                <option key={dir} value={dir}>
                  {dir}
                </option>
              ))}
            </select>
            <button className="icon-btn" onClick={onBrowseTargetDir} disabled={downloading} title="Browse folder">
              <FolderOpen size={12} />
            </button>
          </div>
        </div>

        {selectedFile && (
          <div className="selected-file-summary">
            <span>{selectedFile.filename}</span>
            <strong>{selectedFile.size_bytes ? formatBytes(selectedFile.size_bytes) : "size unknown"}</strong>
          </div>
        )}

        {progress && (
          <div className="download-progress">
            <div className="progress-meta">
              <span>{progress.filename}</span>
              <strong>
                {progressPercent !== null
                  ? `${progressPercent}%`
                  : formatBytes(progress.downloaded_bytes)}
              </strong>
            </div>
            <div className="progress-track">
              <div
                className={`progress-fill ${progress.status}`}
                style={{ width: `${progressPercent ?? (progress.status === "complete" ? 100 : 18)}%` }}
              />
            </div>
            <div className="progress-meta muted">
              <span>{progress.status}</span>
              <span>
                {formatBytes(progress.downloaded_bytes)}
                {progress.total_bytes ? ` / ${formatBytes(progress.total_bytes)}` : ""}
              </span>
            </div>
          </div>
        )}

        {!downloading ? (
          <button
            className="btn btn-success btn-block"
            onClick={onStartDownload}
            disabled={!selectedFilePath || !targetDir}
          >
            <Download size={15} />
            Download Model
          </button>
        ) : (
          <button className="btn btn-danger btn-block" onClick={onCancelDownload}>
            <X size={15} />
            Cancel Download
          </button>
        )}

        {selectedFile && <div className="path-display">{selectedFile.path}</div>}
      </div>
    </div>
  );
}
