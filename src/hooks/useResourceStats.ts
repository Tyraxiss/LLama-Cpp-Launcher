import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ResourceStats } from "../types";
import { deferAfterStartup } from "../utils/startup";

function statsFingerprint(stats: ResourceStats): string {
  return JSON.stringify({
    s: [stats.system.used_bytes, stats.system.total_bytes],
    g: stats.gpus.map((gpu) => [gpu.index, gpu.used_bytes, gpu.total_bytes]),
    p: stats.server_process
      ? [stats.server_process.pid, stats.server_process.ram_bytes, stats.server_process.gpu_bytes]
      : null,
    m: stats.model_breakdown.map((row) => [row.device, row.self_mib, row.model_mib]),
  });
}

export function useResourceStats() {
  const [resourceStats, setResourceStats] = useState<ResourceStats | null>(null);
  const inFlight = useRef(false);
  const lastFingerprint = useRef("");

  useEffect(() => {
    let cancelled = false;

    const pollResources = async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const stats = await invoke<ResourceStats>("get_resource_stats");
        if (cancelled) return;
        const next = statsFingerprint(stats);
        if (next !== lastFingerprint.current) {
          lastFingerprint.current = next;
          setResourceStats(stats);
        }
      } catch {
        // Ignore transient read errors.
      } finally {
        inFlight.current = false;
      }
    };

    const cancelDefer = deferAfterStartup(() => {
      void pollResources();
    }, 600);
    // Header stats are useful but not urgent when idle.
    const intervalId = window.setInterval(pollResources, 5000);

    return () => {
      cancelled = true;
      cancelDefer();
      clearInterval(intervalId);
    };
  }, []);

  return resourceStats;
}
