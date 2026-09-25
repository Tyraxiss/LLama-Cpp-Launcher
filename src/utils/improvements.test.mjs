import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRedactedDiagnostics,
  cancelQueueItem,
  deserializeDownloadQueue,
  estimateModelMemory,
  isLocalBindAddress,
  normalizeServerSettings,
  parseIpv4Address,
  retryQueueItem,
  serializeDownloadQueue,
  suggestMmprojPath,
  validateServerSettings,
} from "./improvements.mjs";

const validSettings = {
  host: "127.0.0.1",
  port: 8080,
  ctxSize: 8192,
  ngl: 99,
  threads: 0,
  batchSize: 512,
  temp: 0.7,
  topP: 0.9,
  topK: 40,
  minP: 0.05,
  repeatPenalty: 1.1,
  presencePenalty: 0,
  mainGpu: null,
  tensorSplit: null,
};

test("recognizes valid and local IPv4 bind addresses", () => {
  assert.deepEqual(parseIpv4Address("192.168.1.25"), [192, 168, 1, 25]);
  assert.equal(parseIpv4Address("300.1.1.1"), null);
  assert.equal(isLocalBindAddress("localhost"), true);
  assert.equal(isLocalBindAddress("127.0.0.2"), true);
  assert.equal(isLocalBindAddress("0.0.0.0"), false);
});

test("validates launch settings and tensor splits", () => {
  assert.equal(validateServerSettings(validSettings).valid, true);
  assert.equal(
    validateServerSettings({ ...validSettings, host: "0.0.0.0", tensorSplit: "0.5,0.5" }).valid,
    true,
  );
  assert.equal(validateServerSettings({ ...validSettings, host: " 127.0.0.1" }).valid, false);
  assert.equal(validateServerSettings({ ...validSettings, batchSize: 0 }).valid, false);
  assert.equal(validateServerSettings({ ...validSettings, port: 65536 }).valid, false);
  assert.equal(validateServerSettings({ ...validSettings, tensorSplit: "0.5,nope" }).valid, false);
  assert.equal(validateServerSettings({ ...validSettings, tensorSplit: "1e-2, .5" }).valid, true);
  assert.equal(
    validateServerSettings({ ...validSettings, tensorSplit: "Infinity,1" }).valid,
    false,
  );
});

test("config migration fills legacy and optional server settings", () => {
  assert.equal(normalizeServerSettings({ last_ctx_size: 4096 }).ctxSize, 4096);
  assert.equal(normalizeServerSettings({}).host, "127.0.0.1");
  assert.equal(normalizeServerSettings({ last_min_p: null }).minP, 0.05);
});

test("model and mmproj matching normalizes Windows and slash paths", () => {
  const mmprojs = [
    {
      path: String.raw`C:\models\mmproj-gemma-4-E4B-F16.gguf`,
      filename: "mmproj-gemma-4-E4B-F16.gguf",
    },
  ];
  assert.equal(
    suggestMmprojPath(String.raw`C:\models\gemma-4-E4B-Q4_K_M.gguf`, mmprojs),
    mmprojs[0].path,
  );
  assert.equal(suggestMmprojPath("C:/models/gemma-4-E4B-Q4_K_M.gguf", mmprojs), mmprojs[0].path);
  assert.equal(
    suggestMmprojPath(String.raw`C:\models\qwen-7b.gguf`, [
      { path: String.raw`C:\models\mmproj-F16.gguf`, filename: "mmproj-F16.gguf" },
    ]),
    null,
  );
});

test("memory preflight is advisory and warns when estimated usage is high", () => {
  const estimate = estimateModelMemory({
    modelBytes: 12 * 1024 ** 3,
    contextSize: 32768,
    gpuLayers: 99,
    stats: {
      system: { available_bytes: 4 * 1024 ** 3 },
      gpus: [{ index: 0, free_bytes: 4 * 1024 ** 3 }],
    },
  });
  assert.equal(estimate.status, "warning");
  assert.match(estimate.message, /lower context length/i);
  assert.equal(
    estimateModelMemory({ modelBytes: 1, contextSize: 1, gpuLayers: 0, stats: null }).status,
    "unknown",
  );
});

test("persistent queue omits credentials and restores auth-required retry state", () => {
  const json = serializeDownloadQueue([
    {
      id: "job-1",
      repo: "org/model",
      file_path: "model.gguf",
      filename: "model.gguf",
      target_dir: "C:/models",
      token: "hf_secret",
      error: "private token detail",
      result_path: "C:/models/model.gguf",
      status: "downloading",
    },
  ]);
  assert.equal(json.includes("hf_secret"), false);
  assert.equal(json.includes("result_path"), false);
  assert.equal(json.includes("private token detail"), false);
  const [restored] = deserializeDownloadQueue(json);
  assert.equal(restored.status, "cancelled");
  assert.equal(restored.token, null);
  assert.equal(restored.tokenRequired, true);
  assert.equal(retryQueueItem(restored, "").needsToken, true);
  assert.equal(retryQueueItem(restored, "hf_new").token, "hf_new");
  assert.equal(retryQueueItem({ ...restored, tokenRequired: false }, "").status, "pending");
  assert.deepEqual(deserializeDownloadQueue("not json"), []);
});

test("cancel marks active queue work resumable and clears the runtime token", () => {
  const item = cancelQueueItem({ id: "job", status: "downloading", token: "secret" });
  assert.equal(item.status, "cancelled");
  assert.equal(item.token, null);
});

test("diagnostics redaction removes secrets and personal paths", () => {
  const safe = buildRedactedDiagnostics({
    appVersion: "1.1.1",
    llamaTag: "b10003",
    llamaBackend: "cuda-12.4",
    stats: {
      api_key: "secret",
      model_path: String.raw`C:\Users\Alice\models\model.gguf`,
    },
    serverLog: [
      "Authorization: Bearer abc",
      String.raw`Loaded C:\Users\Alice\model.gguf`,
      String.raw`Loaded C:\Users\Alice Smith\model.gguf`,
    ],
    openWebuiLog: ["HF_TOKEN=hf_abcdefghijklmnop1234"],
    exportedAt: "now",
  });
  const serialized = JSON.stringify(safe);
  assert.equal("api_key" in safe.hardware, false);
  assert.equal(safe.hardware.model_path, "<path>");
  assert.match(safe.logs.llamaServer[0], /<redacted>/);
  assert.match(safe.logs.llamaServer[1], /<path>/);
  assert.equal(serialized.includes("Alice"), false);
  assert.equal(serialized.includes("hf_abcdefghijklmnop1234"), false);
  assert.equal(safe.logs.llamaServer.length, 3);
});
