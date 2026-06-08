const STARTUP_DEFER_MS = 400;

export function deferAfterStartup(task: () => void, delayMs = STARTUP_DEFER_MS): () => void {
  const timerId = window.setTimeout(task, delayMs);
  return () => window.clearTimeout(timerId);
}

export function runWhenIdle(task: () => void, timeoutMs = 2000): () => void {
  if ("requestIdleCallback" in window) {
    const idleId = window.requestIdleCallback(() => task(), { timeout: timeoutMs });
    return () => window.cancelIdleCallback(idleId);
  }

  return deferAfterStartup(task, STARTUP_DEFER_MS);
}
