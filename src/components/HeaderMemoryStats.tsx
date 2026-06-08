import { Activity, Cpu } from "lucide-react";
import type { ReactNode } from "react";
import type { ProcessStatus } from "../hooks/useLlamaServer";
import type { ModelMemoryBreakdown, ResourceStats } from "../types";
import { formatBytes, formatPercent } from "../utils/config";

interface HeaderMemoryStatsProps {
  stats: ResourceStats | null;
  isRunning: boolean;
  serverStatus: ProcessStatus;
}

function formatBreakdownLine(entry: ModelMemoryBreakdown): string {
  if (entry.total_mib > 0) {
    return `${entry.device}: ${Math.round(entry.self_mib)} MiB used, ${Math.round(entry.free_mib)} MiB free (weights ${Math.round(entry.model_mib)}, KV ${Math.round(entry.context_mib)}, compute ${Math.round(entry.compute_mib)})`;
  }
  return `${entry.device}: weights ${Math.round(entry.model_mib)} MiB, KV ${Math.round(entry.context_mib)} MiB, compute ${Math.round(entry.compute_mib)} MiB`;
}

function buildTooltip(stats: ResourceStats): string {
  const lines = [
    `System RAM: ${formatBytes(stats.system.used_bytes)} / ${formatBytes(stats.system.total_bytes)} (${formatPercent(stats.system.used_bytes, stats.system.total_bytes)})`,
    `${formatBytes(stats.system.available_bytes)} available`,
  ];

  for (const gpu of stats.gpus) {
    lines.push(
      `${gpu.name}: ${formatBytes(gpu.used_bytes)} / ${formatBytes(gpu.total_bytes)} (${formatBytes(gpu.free_bytes)} free)`,
    );
  }

  if (stats.server_process) {
    const gpu =
      stats.server_process.gpu_bytes != null
        ? `, VRAM ${formatBytes(stats.server_process.gpu_bytes)}`
        : "";
    lines.push(
      `llama-server (PID ${stats.server_process.pid}): RAM ${formatBytes(stats.server_process.ram_bytes)}${gpu}`,
    );
  }

  for (const entry of stats.model_breakdown) {
    lines.push(formatBreakdownLine(entry));
  }

  if (stats.gpus.length === 0 && !stats.gpu_available) {
    lines.push("GPU monitoring unavailable (NVIDIA driver not detected or non-NVIDIA GPU).");
  }

  return lines.join("\n");
}

function MemoryChip({
  icon,
  label,
  usedBytes,
  totalBytes,
}: {
  icon: ReactNode;
  label: string;
  usedBytes: number;
  totalBytes: number;
}) {
  const pct = totalBytes > 0 ? Math.min(100, (usedBytes / totalBytes) * 100) : 0;

  return (
    <div className="header-memory-chip">
      {icon}
      <span className="header-memory-chip-label">{label}</span>
      <span className="header-memory-chip-value">
        {formatBytes(usedBytes)}/{formatBytes(totalBytes)}
      </span>
      <div className="header-memory-chip-bar" aria-hidden="true">
        <div className="header-memory-chip-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function HeaderMemoryStats({ stats, isRunning, serverStatus }: HeaderMemoryStatsProps) {
  if (!stats) {
    return (
      <div className="header-memory" title="Collecting memory stats">
        <span className="header-memory-chip header-memory-chip-muted">Memory…</span>
      </div>
    );
  }

  const primaryGpu = stats.gpus[0];
  const showServerStats = isRunning || stats.server_process != null;

  return (
    <div className="header-memory" title={buildTooltip(stats)}>
      <MemoryChip
        icon={<Cpu size={12} />}
        label="RAM"
        usedBytes={stats.system.used_bytes}
        totalBytes={stats.system.total_bytes}
      />

      {primaryGpu ? (
        <MemoryChip
          icon={<Activity size={12} />}
          label={stats.gpus.length > 1 ? `GPU ${primaryGpu.index}` : "VRAM"}
          usedBytes={primaryGpu.used_bytes}
          totalBytes={primaryGpu.total_bytes}
        />
      ) : null}

      {showServerStats && stats.server_process ? (
        <span className="header-memory-chip header-memory-chip-process">
          PID {stats.server_process.pid}
          {stats.server_process.gpu_bytes != null
            ? ` · ${formatBytes(stats.server_process.gpu_bytes)} VRAM`
            : ` · ${formatBytes(stats.server_process.ram_bytes)} RAM`}
        </span>
      ) : null}

      {showServerStats && serverStatus === "running" && stats.model_breakdown.length > 0 ? (
        <span className="header-memory-chip header-memory-chip-muted">
          Model{" "}
          {Math.round(stats.model_breakdown[0].self_mib || stats.model_breakdown[0].model_mib)} MiB
        </span>
      ) : null}
    </div>
  );
}
