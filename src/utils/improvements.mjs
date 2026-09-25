const MAX_QUEUE_ITEMS = 50;
const VALID_QUEUE_STATUSES = new Set(["pending", "downloading", "complete", "cancelled", "error"]);

export function parseIpv4Address(value) {
  const parts = String(value ?? "")
    .trim()
    .split(".");
  if (parts.length !== 4 || parts.some((part) => !/^[0-9]{1,3}$/.test(part))) return null;
  const octets = parts.map(Number);
  return octets.every((octet) => octet >= 0 && octet <= 255) ? octets : null;
}

export function isLocalBindAddress(value) {
  const text = String(value ?? "")
    .trim()
    .toLowerCase();
  if (text === "localhost") return true;
  const octets = parseIpv4Address(text);
  return Boolean(octets && octets[0] === 127);
}

export function normalizeServerSettings(cfg = {}) {
  return {
    ctxSize: cfg.last_ctx_size ?? 8192,
    port: cfg.last_port ?? 8080,
    host: cfg.last_host ?? "127.0.0.1",
    ngl: cfg.last_ngl ?? 99,
    temp: cfg.last_temp ?? 0.7,
    threads: cfg.last_threads ?? 0,
    batchSize: cfg.last_batch_size ?? 512,
    topP: cfg.last_top_p ?? 0.9,
    topK: cfg.last_top_k ?? 40,
    minP: cfg.last_min_p ?? 0.05,
    repeatPenalty: cfg.last_repeat_penalty ?? 1.1,
    presencePenalty: cfg.last_presence_penalty ?? 0,
    flashAttn: cfg.last_flash_attn ?? false,
    mainGpu: cfg.last_main_gpu ?? null,
    tensorSplit: cfg.last_tensor_split ?? null,
    noMmap: cfg.last_no_mmap ?? false,
    noWebui: cfg.last_no_webui ?? false,
  };
}

export function suggestMmprojPath(modelPath, mmprojs) {
  if (!modelPath) return null;
  const normalize = (path) =>
    String(path).split(String.fromCharCode(92)).join("/").replace(/\/+$/, "").toLowerCase();
  const parent = (path) => {
    const normalized = normalize(path);
    const index = normalized.lastIndexOf("/");
    return index < 0 ? "" : normalized.slice(0, index);
  };
  const modelDir = parent(modelPath);
  const modelStem = String(modelPath)
    .split(String.fromCharCode(92))
    .join("/")
    .split("/")
    .pop()
    .replace(/\.gguf$/i, "");
  const noiseTokens = new Set([
    "gguf",
    "mmproj",
    "proj",
    "projector",
    "vision",
    "text",
    "f16",
    "f32",
    "bf16",
    "fp16",
    "fp32",
  ]);
  const tokens = (name) =>
    name
      .toLowerCase()
      .replace(/\.gguf$/i, "")
      .split(/[-_.\s]+/)
      .filter(
        (token) =>
          token.length >= 3 && !noiseTokens.has(token) && !/^q[0-9]+[a-z0-9_]*$/i.test(token),
      );
  const modelTokens = tokens(modelStem);
  const sameDir = (Array.isArray(mmprojs) ? mmprojs : []).filter(
    (item) => parent(item.path) === modelDir,
  );
  let best = null;
  let bestScore = 0;
  for (const item of sameDir) {
    const candidateTokens = tokens(item.filename);
    if (!modelTokens.length || !candidateTokens.length) continue;
    const modelSet = new Set(modelTokens);
    let score = candidateTokens.reduce(
      (sum, token) => sum + (modelSet.has(token) ? (token.length >= 4 ? 3 : 2) : 0),
      0,
    );
    const compactModel = modelTokens.join("");
    const compactCandidate = candidateTokens.join("");
    if (
      compactModel &&
      compactCandidate &&
      (compactModel.includes(compactCandidate) || compactCandidate.includes(compactModel))
    ) {
      score += 4;
    }
    if (score > bestScore) {
      best = item.path;
      bestScore = score;
    }
  }
  return bestScore >= 2 ? best : null;
}

export function buildRedactedDiagnostics({
  appVersion,
  llamaTag,
  llamaBackend,
  stats,
  serverLog,
  openWebuiLog,
  exportedAt = new Date().toISOString(),
}) {
  return redactDiagnosticData({
    exportedAt,
    appVersion,
    llamaCpp: { tag: llamaTag ?? null, backend: llamaBackend ?? null },
    hardware: stats ?? null,
    logs: {
      llamaServer: Array.isArray(serverLog) ? serverLog.slice(-200) : [],
      openWebui: Array.isArray(openWebuiLog) ? openWebuiLog.slice(-200) : [],
    },
  });
}

export function validateServerSettings(settings) {
  const errors = [];
  const host = String(settings?.host ?? "");
  if (
    !host ||
    host !== host.trim() ||
    (host.toLowerCase() !== "localhost" && !parseIpv4Address(host))
  ) {
    errors.push("Host must be localhost or a valid IPv4 bind address.");
  }

  const numericRanges = [
    ["Port", settings?.port, 1024, 65535],
    ["Context length", settings?.ctxSize, 256, 131072],
    ["GPU layers", settings?.ngl, 0, 999],
    ["CPU threads", settings?.threads, 0, 256],
    ["Batch size", settings?.batchSize, 64, 4096],
    ["Temperature", settings?.temp, 0, 2],
    ["Top-P", settings?.topP, 0, 1],
    ["Top-K", settings?.topK, 1, 200],
    ["Min-P", settings?.minP, 0, 0.2],
    ["Repeat penalty", settings?.repeatPenalty, 1, 2],
    ["Presence penalty", settings?.presencePenalty, 0, 2],
  ];
  for (const [label, value, min, max] of numericRanges) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
      errors.push(`${label} must be between ${min} and ${max}.`);
    }
  }
  if (
    settings?.mainGpu != null &&
    (!Number.isInteger(settings.mainGpu) || settings.mainGpu < 0 || settings.mainGpu > 31)
  ) {
    errors.push("Main GPU must be between 0 and 31.");
  }

  const split = String(settings?.tensorSplit ?? "").trim();
  if (split) {
    const values = split.split(",").map((part) => part.trim());
    if (
      values.length > 16 ||
      values.some(
        (part) =>
          !/^[+]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$/.test(part) ||
          !Number.isFinite(Number(part)) ||
          Number(part) < 0,
      ) ||
      !values.some((part) => Number(part) > 0)
    ) {
      errors.push(
        "Tensor split must be a comma-separated list of up to 16 non-negative numbers, with at least one value above zero.",
      );
    }
  }
  return { valid: errors.length === 0, errors };
}

export function estimateModelMemory({ modelBytes, contextSize, gpuLayers, mainGpu, stats }) {
  if (
    !Number.isFinite(modelBytes) ||
    modelBytes <= 0 ||
    !Number.isFinite(contextSize) ||
    contextSize <= 0 ||
    !stats
  ) {
    return {
      status: "unknown",
      message: "Memory estimate unavailable until model size and hardware stats are known.",
      details: [],
    };
  }

  // GGUF size is a useful approximation of weight memory. KV/cache and runtime
  // overhead vary by architecture, quantization, and backend, so reserve a margin.
  const weightsWithOverhead = modelBytes * 1.15;
  const contextBytes = contextSize * 64 * 1024;
  const gpuFraction = Math.min(0.9, Math.max(0, (Number(gpuLayers) || 0) / 40));
  const gpus = Array.isArray(stats.gpus) ? stats.gpus : [];
  const gpuAvailable = gpus.reduce(
    (total, gpu) =>
      total + (mainGpu == null || gpu.index === mainGpu ? Number(gpu.free_bytes) || 0 : 0),
    0,
  );
  // If GPU memory could not be queried, conservatively count all weights as RAM
  // instead of implying offloaded layers will fit.
  const estimatedGpuFraction = gpuAvailable > 0 ? gpuFraction : 0;
  const hostEstimate = weightsWithOverhead * (1 - estimatedGpuFraction) + contextBytes;
  const gpuEstimate =
    weightsWithOverhead * estimatedGpuFraction + contextBytes * estimatedGpuFraction;
  const details = [];
  let mayExceed = false;

  const hostAvailable = Number(stats.system?.available_bytes);
  if (Number.isFinite(hostAvailable) && hostAvailable > 0) {
    details.push(
      `Approx. ${formatMemory(hostEstimate)} system RAM needed; ${formatMemory(hostAvailable)} available.`,
    );
    mayExceed ||= hostEstimate > hostAvailable * 0.9;
  }
  if (gpuFraction > 0 && gpuAvailable > 0) {
    details.push(
      `Approx. ${formatMemory(gpuEstimate)} VRAM needed; ${formatMemory(gpuAvailable)} free across detected GPUs.`,
    );
    mayExceed ||= gpuEstimate > gpuAvailable * 0.9;
  }
  if (details.length === 0) {
    return {
      status: "unknown",
      message: "Hardware memory availability could not be determined; estimate is incomplete.",
      details: [],
    };
  }
  return {
    status: mayExceed ? "warning" : "ok",
    message: mayExceed
      ? "This configuration may exceed available memory. Try a smaller model, lower context length, or fewer GPU layers."
      : "No obvious memory pressure detected. This rough estimate can differ from actual llama.cpp usage.",
    details,
  };
}

function formatMemory(bytes) {
  return `${(bytes / 1024 ** 3).toFixed(1)} GiB`;
}

export function serializeDownloadQueue(queue) {
  return JSON.stringify(
    (Array.isArray(queue) ? queue : [])
      .filter((item) => item && item.status !== "complete" && VALID_QUEUE_STATUSES.has(item.status))
      .slice(0, MAX_QUEUE_ITEMS)
      .map((item) => ({
        id: item.id,
        repo: item.repo,
        file_path: item.file_path,
        filename: item.filename,
        target_dir: item.target_dir,
        status: item.status === "downloading" ? "cancelled" : item.status,
        tokenRequired: Boolean(item.token || item.tokenRequired),
      })),
  );
}

export function deserializeDownloadQueue(value) {
  try {
    const parsed = JSON.parse(value ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item) =>
          item &&
          typeof item.id === "string" &&
          typeof item.repo === "string" &&
          typeof item.file_path === "string" &&
          typeof item.filename === "string" &&
          typeof item.target_dir === "string" &&
          VALID_QUEUE_STATUSES.has(item.status),
      )
      .slice(0, MAX_QUEUE_ITEMS)
      .map((item) => {
        const tokenRequired = Boolean(item.tokenRequired || item.token);
        const status =
          item.status === "downloading" || (item.status === "pending" && tokenRequired)
            ? "cancelled"
            : item.status;
        return {
          id: item.id,
          repo: item.repo,
          file_path: item.file_path,
          filename: item.filename,
          target_dir: item.target_dir,
          status,
          token: null,
          tokenRequired,
          error: item.status === "error" ? "Previous attempt ended; retry to continue." : undefined,
        };
      });
  } catch {
    return [];
  }
}

export function retryQueueItem(item, token) {
  if (!item || (item.status !== "error" && item.status !== "cancelled")) return null;
  if (item.tokenRequired && !String(token ?? "").trim())
    return { ...item, tokenRequired: true, needsToken: true };
  return {
    ...item,
    status: "pending",
    error: undefined,
    token: String(token ?? "").trim() || null,
    tokenRequired: false,
  };
}

export function cancelQueueItem(item) {
  return item?.status === "downloading" ? { ...item, status: "cancelled", token: null } : item;
}

function redactPathFromLine(line) {
  let pathIndex = -1;
  for (let index = 0; index + 2 < line.length; index += 1) {
    const code = line.charCodeAt(index);
    if (
      ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) &&
      line[index + 1] === ":" &&
      [47, 92].includes(line.charCodeAt(index + 2))
    ) {
      pathIndex = index;
      break;
    }
  }

  const privateUnixRoots = ["/Users/", "/home/", "/root/", "/Volumes/", "/mnt/", "/tmp/"];
  for (const root of privateUnixRoots) {
    const index = line.indexOf(root);
    if (index >= 0 && (pathIndex < 0 || index < pathIndex)) pathIndex = index;
  }
  return pathIndex < 0 ? line : `${line.slice(0, pathIndex)}<path>`;
}

export function redactDiagnosticText(value) {
  const secretRedacted = String(value ?? "")
    .replace(
      /\b(authorization\s*[:=]\s*(?:bearer\s+)?|bearer\s+|(?:hf_)?token\s*[:=]\s*)[^\s,;"']+/gi,
      "$1<redacted>",
    )
    .replace(/\bhf_[A-Za-z0-9]{16,}\b|\bsk-[A-Za-z0-9_-]{20,}\b/gi, "<redacted>");
  return secretRedacted.split("\n").map(redactPathFromLine).join("\n");
}

export function redactDiagnosticData(value) {
  if (typeof value === "string") return redactDiagnosticText(value);
  if (Array.isArray(value)) return value.map(redactDiagnosticData);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !/(token|secret|password|credential|api.?key)/i.test(key))
        .map(([key, entry]) => [
          key,
          /path|directory|directories|(?:^|_)dir(?:$|_)/i.test(key)
            ? "<path>"
            : redactDiagnosticData(entry),
        ]),
    );
  }
  return value;
}
