import { useMemo, useState } from "react";
import {
  Download,
  FileSearch,
  FolderOpen,
  KeyRound,
  Loader,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type {
  HfDownloadProgress,
  HfDownloadQueueItem,
  HfGgufFile,
  HfPartialDownload,
} from "../types";

interface HfDownloadPanelProps {
  repo: string;
  token: string;
  files: HfGgufFile[];
  selectedFilePath: string;
  targetDir: string;
  targetDirs: string[];
  loadingFiles: boolean;
  downloading: boolean;
  queue: HfDownloadQueueItem[];
  progress: HfDownloadProgress | null;
  partialDownload: HfPartialDownload | null;
  canResume: boolean;
  autoDownloadMmproj: boolean;
  matchedMmproj: HfGgufFile | null;
  formatBytes: (bytes: number) => string;
  onRepoChange: (value: string) => void;
  onTokenChange: (value: string) => void;
  onSelectedFileChange: (value: string) => void;
  onTargetDirChange: (value: string) => void;
  onLookupFiles: () => void;
  onBrowseTargetDir: () => void;
  onEnqueueDownload: () => void;
  onAutoDownloadMmprojChange: (enabled: boolean) => void;
  onRemoveQueued: (id: string) => void;
  onRetryQueued: (id: string) => void;
  onClearFinishedQueue: () => void;
  onCancelDownload: () => void;
  onDiscardPartial: () => void;
}

function queueStatusLabel(status: HfDownloadQueueItem["status"]): string {
  switch (status) {
    case "pending":
      return "Queued";
    case "downloading":
      return "Downloading";
    case "complete":
      return "Done";
    case "cancelled":
      return "Paused";
    case "error":
      return "Error";
  }
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
  queue,
  progress,
  partialDownload,
  canResume,
  autoDownloadMmproj,
  matchedMmproj,
  formatBytes,
  onRepoChange,
  onTokenChange,
  onSelectedFileChange,
  onTargetDirChange,
  onLookupFiles,
  onBrowseTargetDir,
  onEnqueueDownload,
  onAutoDownloadMmprojChange,
  onRemoveQueued,
  onRetryQueued,
  onClearFinishedQueue,
  onCancelDownload,
  onDiscardPartial,
}: HfDownloadPanelProps) {
  const [fileFilter, setFileFilter] = useState("");
  const [sortMode, setSortMode] = useState<"name" | "small" | "large">("name");
  const selectedFile = files.find((file) => file.path === selectedFilePath);
  const visibleFiles = useMemo(() => {
    const needle = fileFilter.trim().toLowerCase();
    const filtered = needle
      ? files.filter(
          (file) =>
            file.filename.toLowerCase().includes(needle) ||
            file.path.toLowerCase().includes(needle),
        )
      : files;
    return [...filtered].sort((a, b) => {
      if (sortMode === "small")
        return (
          (a.size_bytes ?? Number.MAX_SAFE_INTEGER) - (b.size_bytes ?? Number.MAX_SAFE_INTEGER)
        );
      if (sortMode === "large") return (b.size_bytes ?? 0) - (a.size_bytes ?? 0);
      return a.filename.toLowerCase().localeCompare(b.filename.toLowerCase());
    });
  }, [fileFilter, files, sortMode]);
  const progressPercent =
    progress?.total_bytes && progress.total_bytes > 0
      ? Math.min(100, Math.round((progress.downloaded_bytes / progress.total_bytes) * 100))
      : null;
  const partialPercent =
    partialDownload?.total_bytes && partialDownload.total_bytes > 0
      ? Math.min(
          100,
          Math.round((partialDownload.downloaded_bytes / partialDownload.total_bytes) * 100),
        )
      : null;
  const queueActive = queue.some(
    (item) => item.status === "pending" || item.status === "downloading",
  );
  const finishedCount = queue.filter((item) => item.status === "complete").length;
  const primaryLabel = downloading
    ? "Downloading..."
    : canResume
      ? "Resume Download"
      : queueActive
        ? "Add to Queue"
        : "Download Model";

  return (
    <div className="card">
      <div className="card-header">
        <Download size={14} className="icon" />
        <h3>Hugging Face</h3>
        {downloading && <span className="mini-status starting">Downloading</span>}
        {queue.filter((item) => item.status === "pending").length > 0 && !downloading && (
          <span className="mini-status starting">
            {queue.filter((item) => item.status === "pending").length} queued
          </span>
        )}
      </div>

      <div className="hf-stack">
        <div className="download-step">
          <span className="step-index">1</span>
          <input
            className="form-input hf-input"
            placeholder="owner/model-GGUF:Q4_K_M"
            type="text"
            value={repo}
            onChange={(e) => onRepoChange(e.target.value)}
          />
        </div>
        <div className="example-chips">
          {[
            "unsloth/gemma-4-26B-A4B-it-GGUF:UD-Q2_K_XL",
            "bartowski/Qwen2.5-Coder-7B-Instruct-GGUF:Q4_K_M",
          ].map((example) => (
            <button key={example} className="example-chip" onClick={() => onRepoChange(example)}>
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
              onChange={(e) => onTokenChange(e.target.value)}
            />
          </div>
        </div>

        <button className="btn btn-wide" onClick={onLookupFiles} disabled={loadingFiles}>
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
                  onChange={(e) => setFileFilter(e.target.value)}
                />
              </div>
              <select
                className="form-input small sort-select"
                value={sortMode}
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
                    onClick={() => onSelectedFileChange(file.path)}
                  >
                    <span>{file.filename}</span>
                    <strong>
                      {file.size_bytes ? formatBytes(file.size_bytes) : "size unknown"}
                    </strong>
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
              onChange={(e) => onTargetDirChange(e.target.value)}
            >
              <option value="">Select model folder</option>
              {targetDirs.map((dir) => (
                <option key={dir} value={dir}>
                  {dir}
                </option>
              ))}
            </select>
            <button className="icon-btn" onClick={onBrowseTargetDir} title="Browse folder">
              <FolderOpen size={12} />
            </button>
          </div>
        </div>

        {selectedFile && (
          <div className="selected-file-summary">
            <span>{selectedFile.filename}</span>
            <strong>
              {selectedFile.size_bytes ? formatBytes(selectedFile.size_bytes) : "size unknown"}
            </strong>
          </div>
        )}

        <div className="toggle-row" style={{ alignItems: "flex-start" }}>
          <span>
            <span className="form-label" style={{ display: "block" }}>
              Auto-download matching mmproj
            </span>
            <span className="text-muted" style={{ display: "block", fontSize: 10, marginTop: 2 }}>
              Queues a same-repo vision projector (name match, or mmproj-F16 when that is all the
              repo ships). Leave off for text-only models.
            </span>
          </span>
          <label className="toggle" style={{ marginTop: 4 }}>
            <input
              type="checkbox"
              checked={autoDownloadMmproj}
              onChange={(e) => onAutoDownloadMmprojChange(e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
        </div>

        {autoDownloadMmproj && selectedFile && matchedMmproj && (
          <div className="selected-file-summary muted">
            <span>Also queue: {matchedMmproj.filename}</span>
            <strong>
              {matchedMmproj.size_bytes ? formatBytes(matchedMmproj.size_bytes) : "size unknown"}
            </strong>
          </div>
        )}

        {autoDownloadMmproj && selectedFile && !matchedMmproj && files.length > 0 && (
          <p className="text-muted" style={{ fontSize: 11, margin: 0 }}>
            No matching mmproj found in this repo for the selected file.
          </p>
        )}

        {queue.length > 0 && (
          <div className="download-queue">
            <div className="download-queue-header">
              <span>Download queue</span>
              {finishedCount > 0 && (
                <button className="btn btn-sm" onClick={onClearFinishedQueue}>
                  Clear finished
                </button>
              )}
            </div>
            {queue.map((item) => (
              <div key={item.id} className={`download-queue-item ${item.status}`}>
                <div className="download-queue-item-main">
                  <span className="download-queue-name">{item.filename}</span>
                  <span
                    className={`mini-status ${item.status === "downloading" ? "starting" : item.status === "complete" ? "running" : item.status === "error" ? "error" : ""}`}
                  >
                    {queueStatusLabel(item.status)}
                  </span>
                </div>
                <div className="download-queue-meta">
                  <span>{item.repo}</span>
                  {item.error ? <span className="download-queue-error">{item.error}</span> : null}
                </div>
                {item.status === "pending" && (
                  <button
                    className="btn btn-sm"
                    onClick={() => onRemoveQueued(item.id)}
                    title="Remove from queue"
                  >
                    <Trash2 size={11} />
                    Remove
                  </button>
                )}
                {(item.status === "error" || item.status === "cancelled") && (
                  <button
                    className="btn btn-sm btn-success"
                    onClick={() => onRetryQueued(item.id)}
                    title="Resume this download"
                  >
                    <RefreshCw size={11} />
                    Resume
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {canResume && partialDownload && !downloading && (
          <div className="download-progress">
            <div className="progress-meta">
              <span>Partial download saved</span>
              <strong>
                {partialPercent !== null
                  ? `${partialPercent}%`
                  : formatBytes(partialDownload.downloaded_bytes)}
              </strong>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill cancelled"
                style={{ width: `${partialPercent ?? 18}%` }}
              />
            </div>
            <div className="progress-meta muted">
              <span>Ready to resume</span>
              <span>
                {formatBytes(partialDownload.downloaded_bytes)}
                {partialDownload.total_bytes
                  ? ` / ${formatBytes(partialDownload.total_bytes)}`
                  : ""}
              </span>
            </div>
            <button className="btn btn-sm" onClick={onDiscardPartial}>
              Discard partial
            </button>
          </div>
        )}

        {progress && downloading && (
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
                style={{
                  width: `${progressPercent ?? (progress.status === "complete" ? 100 : 18)}%`,
                }}
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

        <button
          className="btn btn-success btn-block"
          onClick={onEnqueueDownload}
          disabled={!selectedFilePath || !targetDir}
        >
          <Download size={15} />
          {primaryLabel}
        </button>

        {downloading && (
          <button className="btn btn-danger btn-block" onClick={onCancelDownload}>
            <X size={15} />
            Cancel Current Download
          </button>
        )}

        {selectedFile && <div className="path-display">{selectedFile.path}</div>}
      </div>
    </div>
  );
}
