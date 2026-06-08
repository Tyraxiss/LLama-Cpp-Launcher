import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ResourceStats } from "../types";
import { deferAfterStartup } from "../utils/startup";

export function useResourceStats() {
  const [resourceStats, setResourceStats] = useState<ResourceStats | null>(null);

  useEffect(() => {
    let cancelled = false;

    const pollResources = async () => {
      try {
        const stats = await invoke<ResourceStats>("get_resource_stats");
        if (!cancelled) {
          setResourceStats(stats);
        }
      } catch {
        // Ignore transient read errors.
      }
    };

    const cancelDefer = deferAfterStartup(() => {
      void pollResources();
    });
    const intervalId = window.setInterval(pollResources, 3000);

    return () => {
      cancelled = true;
      cancelDefer();
      clearInterval(intervalId);
    };
  }, []);

  return resourceStats;
}
