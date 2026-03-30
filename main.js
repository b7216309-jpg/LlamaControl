const { app, BrowserWindow, ipcMain } = require("electron");
const { spawn, exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const http = require("http");
const os = require("os");
let pty;
try { pty = require("node-pty"); } catch { pty = null; }

const LOG_FILE = path.join(require("os").tmpdir(), "llama-server.log");

// ── Config Management ────────────────────────────────────────────────

const MODEL_PATH = "";
const TEMPLATE_THINK = "";    // thinking template (or empty = use GGUF embedded)
const TEMPLATE_INSTRUCT = ""; // instruct template with enable_thinking=false
const MMPROJ_PATH = "";

// llama.cpp default sampler chain — what Qwen3.5 presets are designed for
const QWEN_SAMPLERS = ["penalties", "dry", "top_k", "typ_p", "top_p", "min_p", "xtc", "temperature"];

const DEFAULT_CONFIG = {
  version: 2,
  llamaServerExe: process.platform === "win32" ? "llama-server.exe" : "llama-server",
  modelsDirectory: path.join(os.homedir(), "Models"),
  activeProfile: "HERETIC Thinking",
  profiles: {
    // ═══════════════════════════════════════════════════════════════════
    //  DavidAU HERETIC — 4 presets from model card
    //  Source: huggingface.co/DavidAU/Qwen3.5-9B-Claude-4.6-OS-Auto-Variable-HERETIC-UNCENSORED-THINKING-MAX-NEOCODE-Imatrix-GGUF
    //  Note: DavidAU recommends smoothing_factor 1.5 (not yet in llama-server API)
    //  Template: custom Jinja embedded in GGUF (thinking). Use instruct .jinja for non-thinking.
    // ═══════════════════════════════════════════════════════════════════

    // ── Profile 1: HERETIC Thinking ─────────────────────────────────
    // Usage: Conversation, analyse, raisonnement, taches generales
    // Source: DavidAU "Thinking Mode General Tasks" — temp 1.0, presence 1.5
    "HERETIC Thinking": {
      name: "HERETIC Thinking",
      modelPath: MODEL_PATH,
      alias: "Qwen3.5-9B-DavidAU-HERETIC",
      chatTemplateFile: TEMPLATE_THINK,
      mmprojFile: MMPROJ_PATH,
      server: { host: "0.0.0.0", port: 8080, ctxSize: 81920, nGpuLayers: 99, threads: 4, nBatch: 4096, parallel: 1 },
      performance: { flashAttn: true, cacheTypeK: "q8_0", cacheTypeV: "q8_0", cudaGraphOpt: true, cudaForceCublasCompute16F: true },
      reasoning: { enabled: true, format: "deepseek" },
      chat: {
        maxTokens: 81920, temperature: 1.0, topP: 0.95, topK: 20, minP: 0.0,
        presencePenalty: 1.5, repetitionPenalty: 1.0,
        seed: -1, repeatLastN: 64, frequencyPenalty: 0, nPredict: -1,
        samplers: QWEN_SAMPLERS,
        stop: ["<|im_end|>", "<|endoftext|>"],
        systemPrompt: "",
      },
      flags: { noContextShift: true, extraArgs: "", contBatching: true, mlock: true },
    },
    // ── Profile 2: HERETIC Code ────────────────────────────────────
    // Usage: Coding precis, WebDev, generation de code structuree
    // Source: DavidAU "Thinking Mode Precise Coding" — temp 0.6, presence 0.0
    "HERETIC Code": {
      name: "HERETIC Code",
      modelPath: MODEL_PATH,
      alias: "Qwen3.5-9B-DavidAU-HERETIC",
      chatTemplateFile: TEMPLATE_THINK,
      mmprojFile: MMPROJ_PATH,
      server: { host: "0.0.0.0", port: 8080, ctxSize: 81920, nGpuLayers: 99, threads: 4, nBatch: 4096, parallel: 1 },
      performance: { flashAttn: true, cacheTypeK: "q8_0", cacheTypeV: "q8_0", cudaGraphOpt: true, cudaForceCublasCompute16F: true },
      reasoning: { enabled: true, format: "deepseek" },
      chat: {
        maxTokens: 81920, temperature: 0.6, topP: 0.95, topK: 20, minP: 0.0,
        presencePenalty: 0.0, repetitionPenalty: 1.0,
        seed: -1, repeatLastN: 64, frequencyPenalty: 0, nPredict: -1,
        samplers: QWEN_SAMPLERS,
        stop: ["<|im_end|>", "<|endoftext|>"],
        systemPrompt: "",
      },
      flags: { noContextShift: true, extraArgs: "", contBatching: true, mlock: true },
    },
    // ── Profile 3: HERETIC Fast ────────────────────────────────────
    // Usage: Chat rapide, reponses directes — thinking OFF
    // Source: DavidAU "Instruct/Non-Thinking General Tasks" — temp 0.7, presence 1.5
    "HERETIC Fast": {
      name: "HERETIC Fast",
      modelPath: MODEL_PATH,
      alias: "Qwen3.5-9B-DavidAU-HERETIC",
      chatTemplateFile: TEMPLATE_INSTRUCT,
      mmprojFile: MMPROJ_PATH,
      server: { host: "0.0.0.0", port: 8080, ctxSize: 81920, nGpuLayers: 99, threads: 4, nBatch: 4096, parallel: 1 },
      performance: { flashAttn: true, cacheTypeK: "q8_0", cacheTypeV: "q8_0", cudaGraphOpt: true, cudaForceCublasCompute16F: true },
      reasoning: { enabled: false, format: "deepseek" },
      chat: {
        maxTokens: 8192, temperature: 0.7, topP: 0.8, topK: 20, minP: 0.0,
        presencePenalty: 1.5, repetitionPenalty: 1.0,
        seed: -1, repeatLastN: 64, frequencyPenalty: 0, nPredict: -1,
        samplers: QWEN_SAMPLERS,
        stop: ["<|im_end|>", "<|endoftext|>"],
        systemPrompt: "",
      },
      flags: { noContextShift: true, extraArgs: "", contBatching: true, mlock: true },
    },
    // ── Profile 4: HERETIC Instruct ─────────────────────────────────
    // Usage: Raisonnement sans thinking, logique, maths, deduction — thinking OFF
    // Source: DavidAU "Instruct/Non-Thinking Reasoning Tasks" — temp 1.0, topP 1.0, presence 2.0
    // Note: presence 2.0 peut causer du language mixing sur longues generations
    "HERETIC Instruct": {
      name: "HERETIC Instruct",
      modelPath: MODEL_PATH,
      alias: "Qwen3.5-9B-DavidAU-HERETIC",
      chatTemplateFile: TEMPLATE_INSTRUCT,
      mmprojFile: MMPROJ_PATH,
      server: { host: "0.0.0.0", port: 8080, ctxSize: 81920, nGpuLayers: 99, threads: 4, nBatch: 4096, parallel: 1 },
      performance: { flashAttn: true, cacheTypeK: "q8_0", cacheTypeV: "q8_0", cudaGraphOpt: true, cudaForceCublasCompute16F: true },
      reasoning: { enabled: false, format: "deepseek" },
      chat: {
        maxTokens: 81920, temperature: 1.0, topP: 1.0, topK: 40, minP: 0.0,
        presencePenalty: 2.0, repetitionPenalty: 1.0,
        seed: -1, repeatLastN: 64, frequencyPenalty: 0, nPredict: -1,
        samplers: QWEN_SAMPLERS,
        stop: ["<|im_end|>", "<|endoftext|>"],
        systemPrompt: "",
      },
      flags: { noContextShift: true, extraArgs: "", contBatching: true, mlock: true },
    },

    // ═══════════════════════════════════════════════════════════════════
    //  HauhauCS Aggressive — Qwen3.5-9B abliterated uncensor
    //  Source: huggingface.co/HauhauCS/Qwen3.5-9B-Uncensored-HauhauCS-Aggressive
    //  Sampling: Qwen3.5 official presets (same base model)
    //  Template: standard Qwen3.5 Jinja embedded in GGUF. Use instruct .jinja for non-thinking.
    //  Note: text only — no mmproj needed
    // ═══════════════════════════════════════════════════════════════════

    // ── Profile 5: HauhauCS Thinking ─────────────────────────────────
    // Usage: Taches generales avec raisonnement, modele uncensored
    // Source: Qwen3.5 official "Thinking Mode General Tasks" — temp 1.0, presence 1.5
    "HauhauCS Thinking": {
      name: "HauhauCS Thinking",
      modelPath: MODEL_PATH,
      alias: "Qwen3.5-9B-HauhauCS-Aggressive",
      chatTemplateFile: "",
      mmprojFile: "",
      server: { host: "0.0.0.0", port: 8080, ctxSize: 81920, nGpuLayers: 99, threads: 4, nBatch: 4096, parallel: 1 },
      performance: { flashAttn: true, cacheTypeK: "q8_0", cacheTypeV: "q8_0", cudaGraphOpt: true, cudaForceCublasCompute16F: true },
      reasoning: { enabled: true, format: "deepseek" },
      chat: {
        maxTokens: 81920, temperature: 1.0, topP: 0.95, topK: 20, minP: 0.0,
        presencePenalty: 1.5, repetitionPenalty: 1.0,
        seed: -1, repeatLastN: 64, frequencyPenalty: 0, nPredict: -1,
        samplers: QWEN_SAMPLERS,
        stop: ["<|im_end|>", "<|endoftext|>"],
        systemPrompt: "",
      },
      flags: { noContextShift: true, extraArgs: "", contBatching: true, mlock: true },
    },
    // ── Profile 6: HauhauCS Fast ─────────────────────────────────────
    // Usage: Chat rapide uncensored, reponses directes — thinking OFF
    // Source: Qwen3.5 official "Non-Thinking General Tasks" — temp 0.7, presence 1.5
    "HauhauCS Fast": {
      name: "HauhauCS Fast",
      modelPath: MODEL_PATH,
      alias: "Qwen3.5-9B-HauhauCS-Aggressive",
      chatTemplateFile: TEMPLATE_INSTRUCT,
      mmprojFile: "",
      server: { host: "0.0.0.0", port: 8080, ctxSize: 81920, nGpuLayers: 99, threads: 4, nBatch: 4096, parallel: 1 },
      performance: { flashAttn: true, cacheTypeK: "q8_0", cacheTypeV: "q8_0", cudaGraphOpt: true, cudaForceCublasCompute16F: true },
      reasoning: { enabled: false, format: "deepseek" },
      chat: {
        maxTokens: 8192, temperature: 0.7, topP: 0.8, topK: 20, minP: 0.0,
        presencePenalty: 1.5, repetitionPenalty: 1.0,
        seed: -1, repeatLastN: 64, frequencyPenalty: 0, nPredict: -1,
        samplers: QWEN_SAMPLERS,
        stop: ["<|im_end|>", "<|endoftext|>"],
        systemPrompt: "",
      },
      flags: { noContextShift: true, extraArgs: "", contBatching: true, mlock: true },
    },
  },
};

let config = null;
let configPath = null;

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergeConfigValue(base, override) {
  if (override === undefined) return cloneValue(base);
  if (Array.isArray(base)) return Array.isArray(override) ? [...override] : cloneValue(base);
  if (base && typeof base === "object" && !Array.isArray(base)) {
    const overrideObj = override && typeof override === "object" && !Array.isArray(override) ? override : {};
    const result = {};
    const keys = new Set([...Object.keys(base), ...Object.keys(overrideObj)]);
    for (const key of keys) {
      result[key] = mergeConfigValue(base[key], overrideObj[key]);
    }
    return result;
  }
  if (override && typeof override === "object") return cloneValue(override);
  return override;
}

function normalizeConfig(raw) {
  const cfg = mergeConfigValue(DEFAULT_CONFIG, raw || {});
  if (!cfg.profiles || typeof cfg.profiles !== "object") {
    cfg.profiles = cloneValue(DEFAULT_CONFIG.profiles);
  }
  if (!cfg.profiles[cfg.activeProfile]) {
    cfg.activeProfile = Object.keys(cfg.profiles)[0] || DEFAULT_CONFIG.activeProfile;
  }
  return cfg;
}

function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      return normalizeConfig(raw);
    }
  } catch {}
  const cfg = normalizeConfig(DEFAULT_CONFIG);
  saveConfig(cfg);
  return cfg;
}

function saveConfig(cfg) {
  const normalized = normalizeConfig(cfg);
  fs.writeFileSync(configPath, JSON.stringify(normalized, null, 2), "utf-8");
  return normalized;
}

function getActiveProfile() {
  return config.profiles[config.activeProfile] || config.profiles.default || Object.values(config.profiles)[0];
}

// ── Server Management ────────────────────────────────────────────────

// Cross-platform process tree kill
function killPid(pid) {
  return new Promise((resolve) => {
    if (process.platform === "win32") {
      exec(`taskkill /F /T /PID ${pid}`, { timeout: 5000 }, () => resolve());
    } else {
      // On Unix, detached processes are group leaders — kill the group
      try { process.kill(-pid, "SIGKILL"); } catch {}
      resolve();
    }
  });
}

function killByName(name) {
  return new Promise((resolve) => {
    if (process.platform === "win32") {
      exec(`taskkill /F /IM ${name}`, { timeout: 5000 }, () => resolve());
    } else {
      exec(`pkill -9 -f ${name}`, { timeout: 5000 }, () => resolve());
    }
  });
}

let serverProcess = null;

function buildServerArgs() {
  const p = getActiveProfile();
  const args = [
    "--model", p.modelPath,
    "--host", p.server.host,
    "--port", String(p.server.port),
    "--ctx-size", String(p.server.ctxSize),
    "--n-gpu-layers", String(p.server.nGpuLayers),
    "--threads", String(p.server.threads),
    "--alias", p.alias,
    "--cache-type-k", p.performance.cacheTypeK,
    "--cache-type-v", p.performance.cacheTypeV,
    "--batch-size", String(p.server.nBatch || 2048),
    "--parallel", String(p.server.parallel || 1),
    "--metrics",
    "--slots",
    "--jinja",
  ];
  if (p.chatTemplateFile) args.push("--chat-template-file", p.chatTemplateFile);
  if (p.mmprojFile) args.push("--mmproj", p.mmprojFile);
  if (p.performance.flashAttn) args.push("--flash-attn", "on");
  if (p.reasoning.enabled) {
    args.push("--reasoning-format", p.reasoning.format);
  }
  if (p.chat.nPredict && p.chat.nPredict > 0) args.push("--n-predict", String(p.chat.nPredict));
  if (p.flags.noContextShift) args.push("--no-context-shift");
  if (p.flags.contBatching) args.push("--cont-batching");
  if (p.flags.mlock) args.push("--mlock");
  if (p.flags.extraArgs && p.flags.extraArgs.trim()) {
    args.push(...p.flags.extraArgs.trim().split(/\s+/));
  }
  return args;
}

function buildServerEnv() {
  const p = getActiveProfile();
  const env = { ...process.env };
  if (p.performance.cudaGraphOpt) env.GGML_CUDA_GRAPH_OPT = "1";
  if (p.performance.cudaForceCublasCompute16F) env.GGML_CUDA_FORCE_CUBLAS_COMPUTE_16F = "1";
  return env;
}

function getPort() {
  return getActiveProfile().server.port;
}

function getConnectHost() {
  const host = getActiveProfile().server.host;
  if (!host || host === "0.0.0.0" || host === "::") return "127.0.0.2";
  return host;
}

function checkHealth() {
  return new Promise((resolve) => {
    const req = http.get(`http://${getConnectHost()}:${getPort()}/health`, { timeout: 3000 }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch { resolve(null); }
      });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
  });
}

function startServer() {
  return new Promise((resolve, reject) => {
    const logStream = fs.openSync(LOG_FILE, "w");
    const child = spawn(config.llamaServerExe, buildServerArgs(), {
      detached: true,
      stdio: ["ignore", logStream, logStream],
      env: buildServerEnv(),
    });
    child.on("error", (err) => reject(err));
    fs.closeSync(logStream);
    child.unref();
    serverProcess = child;
    resolve();
  });
}

async function stopServer() {
  if (serverProcess && serverProcess.pid) {
    await killPid(serverProcess.pid);
    serverProcess = null;
  } else {
    const name = process.platform === "win32" ? "llama-server.exe" : "llama-server";
    await killByName(name);
  }
}

// ── Companion.py Lifecycle ───────────────────────────────────────────

let companionProcess = null;

function startCompanion() {
  return new Promise((resolve) => {
    if (companionProcess) { resolve(); return; }
    const pyScript = path.join(__dirname, "companion.py");
    let settled = false;
    const finish = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    try {
      const child = spawn("python", [pyScript], {
        detached: true,
        stdio: "ignore",
      });
      child.once("error", () => {
        companionProcess = null;
        finish();
      });
      child.once("exit", () => {
        if (companionProcess === child) companionProcess = null;
      });
      child.unref();
      companionProcess = child;
      // Give it a moment to start
      setTimeout(finish, 500);
    } catch (e) {
      companionProcess = null;
      finish();
    }
  });
}

async function stopCompanion() {
  if (companionProcess && companionProcess.pid) {
    await killPid(companionProcess.pid);
    companionProcess = null;
  }
}

// ── IPC: Server Controls ─────────────────────────────────────────────

ipcMain.handle("get-status", async () => {
  const health = await checkHealth();
  if (!health) return { running: false, status: "stopped" };
  return { running: true, status: health.status || "ok" };
});

ipcMain.handle("start-server", async () => {
  const health = await checkHealth();
  if (health) return { ok: true, msg: "Already running" };
  await startServer();
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const h = await checkHealth();
    if (h) return { ok: true, msg: "Started" };
  }
  return { ok: false, msg: "Timeout waiting for server" };
});

ipcMain.handle("stop-server", async () => {
  await stopServer();
  await new Promise((r) => setTimeout(r, 1000));
  return { ok: true, msg: "Stopped" };
});

ipcMain.handle("reboot-server", async () => {
  await stopServer();
  await new Promise((r) => setTimeout(r, 2000));
  await startServer();
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const h = await checkHealth();
    if (h) return { ok: true, msg: "Rebooted" };
  }
  return { ok: false, msg: "Timeout waiting for server" };
});

ipcMain.handle("get-logs", async (event, lineCount) => {
  try {
    const content = fs.readFileSync(LOG_FILE, "utf-8");
    const lines = content.split("\n");
    return lines.slice(-(lineCount || 40)).join("\n");
  } catch {
    return "(no logs)";
  }
});

ipcMain.handle("clear-logs", async () => {
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.writeFileSync(LOG_FILE, "", "utf-8");
    return { ok: true };
  } catch (err) {
    return { ok: false, msg: err.message };
  }
});

// ── IPC: Server Info & Metrics ───────────────────────────────────────

ipcMain.handle("get-server-info", async () => {
  const p = getActiveProfile();
  return {
    host: p.server.host,
    connectHost: getConnectHost(),
    port: p.server.port,
    ctxSize: p.server.ctxSize,
    alias: p.alias,
    modelPath: p.modelPath,
    nGpuLayers: p.server.nGpuLayers,
    threads: p.server.threads,
    nBatch: p.server.nBatch || 512,
    flashAttn: p.performance.flashAttn,
    cacheTypeK: p.performance.cacheTypeK,
    cacheTypeV: p.performance.cacheTypeV,
    noContextShift: p.flags.noContextShift,
    reasoning: p.reasoning,
    chatTemplateFile: p.chatTemplateFile,
  };
});

ipcMain.handle("get-system-metrics", async () => {
  return new Promise((resolve) => {
    const req = http.get("http://localhost:8765", { timeout: 2000 }, (res) => {
      if (res.statusCode !== 200) { res.resume(); resolve(null); return; }
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch { resolve(null); }
      });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
  });
});

ipcMain.handle("get-llm-metrics", async () => {
  return new Promise((resolve) => {
    const req = http.get(`http://${getConnectHost()}:${getPort()}/metrics`, { timeout: 2000 }, (res) => {
      if (res.statusCode !== 200) { res.resume(); resolve(null); return; }
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          // Parse Prometheus text format
          const m = {};
          data.split("\n").forEach((l) => {
            if (l.startsWith("#") || !l.trim()) return;
            const r = l.match(/^([^\s{]+)(?:\{[^}]*\})?\s+(.+)$/);
            if (r) m[r[1]] = parseFloat(r[2]);
          });
          resolve(Object.keys(m).length > 0 ? m : null);
        } catch { resolve(null); }
      });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
  });
});

ipcMain.handle("get-llm-slots", async () => {
  return new Promise((resolve) => {
    const req = http.get(`http://${getConnectHost()}:${getPort()}/slots`, { timeout: 2000 }, (res) => {
      if (res.statusCode !== 200) { res.resume(); resolve([]); return; }
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch { resolve([]); }
      });
    });
    req.on("error", () => resolve([]));
    req.on("timeout", () => { req.destroy(); resolve([]); });
  });
});

ipcMain.handle("kill-all-slots", async () => {
  const port = getPort();
  const host = getConnectHost();
  // Fetch current slots
  const slots = await new Promise((resolve) => {
    const req = http.get(`http://${host}:${port}/slots`, { timeout: 3000 }, (res) => {
      if (res.statusCode !== 200) { res.resume(); resolve([]); return; }
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => { try { resolve(JSON.parse(d)); } catch { resolve([]); } });
    });
    req.on("error", () => resolve([]));
    req.on("timeout", () => { req.destroy(); resolve([]); });
  });
  if (!slots.length) return { ok: false, msg: "No slots found" };
  // Erase each slot
  let killed = 0;
  for (const slot of slots) {
    await new Promise((resolve) => {
      const opts = { hostname: host, port, path: `/slots/${slot.id}?action=erase`, method: "POST", timeout: 3000 };
      const req = http.request(opts, (res) => { res.resume(); res.on("end", () => { if (res.statusCode === 200) killed++; resolve(); }); });
      req.on("error", () => resolve());
      req.on("timeout", () => { req.destroy(); resolve(); });
      req.end();
    });
  }
  return { ok: true, msg: `Erased ${killed}/${slots.length} slots` };
});

// ── IPC: Companion Lifecycle ─────────────────────────────────────────

ipcMain.handle("start-companion", async () => {
  await startCompanion();
  return { ok: true };
});

ipcMain.handle("stop-companion", async () => {
  await stopCompanion();
  return { ok: true };
});

// ── IPC: Chat ────────────────────────────────────────────────────────

let currentChatReq = null;

ipcMain.handle("chat-send", async (event, messages, inferenceParams) => {
  const p = getActiveProfile();
  const params = inferenceParams || {};
  const body = JSON.stringify({
    messages,
    max_tokens: params.n_predict !== undefined && params.n_predict > 0 ? params.n_predict : p.chat.maxTokens,
    stream: true,
    temperature: params.temperature ?? p.chat.temperature,
    top_p: params.top_p ?? p.chat.topP,
    top_k: params.top_k ?? p.chat.topK,
    min_p: params.min_p ?? p.chat.minP,
    presence_penalty: params.presence_penalty ?? p.chat.presencePenalty,
    repeat_penalty: params.repeat_penalty ?? p.chat.repetitionPenalty,
    frequency_penalty: params.frequency_penalty ?? p.chat.frequencyPenalty ?? 0,
    repeat_last_n: params.repeat_last_n ?? p.chat.repeatLastN ?? 64,
    seed: params.seed !== undefined && params.seed >= 0 ? params.seed : undefined,
    stop: params.stop && params.stop.length > 0 ? params.stop : undefined,
    samplers: params.samplers || undefined,
  });

  return new Promise((resolve, reject) => {
    let resolved = false;
    const req = http.request({
      hostname: getConnectHost(),
      port: getPort(),
      path: "/v1/chat/completions",
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    }, (res) => {
      let buffer = "";
      res.on("data", (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop();
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "[DONE]") {
              if (!resolved) {
                resolved = true;
                win.webContents.send("chat-done");
                currentChatReq = null;
                resolve({ ok: true });
              }
              return;
            }
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta || {};
              win.webContents.send("chat-token", delta);
            } catch {}
          }
        }
      });
      res.on("end", () => {
        if (!resolved) {
          resolved = true;
          win.webContents.send("chat-done");
          currentChatReq = null;
          resolve({ ok: true });
        }
      });
    });
    req.on("error", (err) => {
      win.webContents.send("chat-done");
      currentChatReq = null;
      reject(err);
    });
    currentChatReq = req;
    req.write(body);
    req.end();
  });
});

ipcMain.handle("chat-stop", async () => {
  if (currentChatReq) {
    currentChatReq.destroy();
    currentChatReq = null;
  }
  return { ok: true };
});

// ── IPC: Config & Profiles ───────────────────────────────────────────

ipcMain.handle("get-config", async () => {
  return config;
});

ipcMain.handle("save-config", async (event, newConfig) => {
  config = saveConfig(newConfig);
  return { ok: true };
});

ipcMain.handle("scan-models", async () => {
  const modelsDir = config.modelsDirectory;
  const results = [];

  function scanDir(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.name.endsWith(".gguf") && !entry.name.toLowerCase().startsWith("mmproj")) {
        const stats = fs.statSync(fullPath);
        const parentDir = path.dirname(fullPath);
        const parentFiles = fs.readdirSync(parentDir);
        const chatTemplate = parentFiles.find((f) => /^chat_template.*\.jinja$/.test(f) && !/instruct/i.test(f));
        const chatTemplateInstruct = parentFiles.find((f) => /^chat_template.*instruct.*\.jinja$/i.test(f));
        const mmproj = parentFiles.find((f) => /^mmproj.*\.gguf$/i.test(f));
        results.push({
          path: fullPath,
          name: entry.name.replace(".gguf", ""),
          sizeBytes: stats.size,
          sizeDisplay: (stats.size / (1024 * 1024 * 1024)).toFixed(1) + " GB",
          chatTemplateFile: chatTemplate ? path.join(parentDir, chatTemplate) : (chatTemplateInstruct ? path.join(parentDir, chatTemplateInstruct) : null),
          chatTemplateInstructFile: chatTemplateInstruct ? path.join(parentDir, chatTemplateInstruct) : null,
          mmprojFile: mmproj ? path.join(parentDir, mmproj) : null,
          directory: parentDir,
        });
      }
    }
  }

  scanDir(modelsDir);
  return results;
});

ipcMain.handle("get-profiles", async () => {
  return { profiles: config.profiles, activeProfile: config.activeProfile };
});

ipcMain.handle("save-profile", async (event, name, profile) => {
  config.profiles[name] = { ...profile, name };
  saveConfig(config);
  return { ok: true };
});

ipcMain.handle("delete-profile", async (event, name) => {
  if (name === config.activeProfile) {
    return { ok: false, msg: "Cannot delete the active profile" };
  }
  delete config.profiles[name];
  saveConfig(config);
  return { ok: true };
});

ipcMain.handle("set-active-profile", async (event, name) => {
  if (!config.profiles[name]) {
    return { ok: false, msg: "Profile not found" };
  }
  config.activeProfile = name;
  saveConfig(config);
  return { ok: true };
});

ipcMain.handle("kill-process", async (event, pid) => {
  pid = parseInt(pid, 10);
  if (isNaN(pid) || pid <= 0) return { ok: false, msg: "invalid pid" };
  try {
    process.kill(pid, "SIGKILL");
    return { ok: true, msg: "killed" };
  } catch (err) {
    return { ok: false, msg: err.message };
  }
});

// ── IPC: Terminal PTY (with child_process fallback) ──────────────────

const terminals = {}; // id -> {type:'pty'|'proc', handle}

ipcMain.handle("pty-create", (event, id, shellCmd) => {
  if (terminals[id]) return { ok: true, msg: "already exists" };
  const shell = shellCmd || (process.platform === "win32" ? "powershell.exe" : "bash");

  // Try node-pty first, fallback to child_process
  if (pty) {
    try {
      const term = pty.spawn(shell, [], {
        name: "xterm-256color", cols: 120, rows: 30,
        cwd: os.homedir(), env: process.env,
      });
      terminals[id] = { type: "pty", handle: term };
      term.onData((data) => {
        if (win && !win.isDestroyed()) win.webContents.send("pty-data", id, data);
      });
      term.onExit(() => {
        delete terminals[id];
        if (win && !win.isDestroyed()) win.webContents.send("pty-exit", id);
      });
      return { ok: true, mode: "pty" };
    } catch (e) { /* fallthrough to spawn */ }
  }

  // Fallback: child_process.spawn
  try {
    const child = spawn(shell, [], {
      cwd: os.homedir(),
      env: { ...process.env, TERM: "xterm-256color" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    terminals[id] = { type: "proc", handle: child };
    child.stdout.on("data", (data) => {
      if (win && !win.isDestroyed()) win.webContents.send("pty-data", id, data.toString());
    });
    child.stderr.on("data", (data) => {
      if (win && !win.isDestroyed()) win.webContents.send("pty-data", id, data.toString());
    });
    child.on("exit", () => {
      delete terminals[id];
      if (win && !win.isDestroyed()) win.webContents.send("pty-exit", id);
    });
    return { ok: true, mode: "spawn" };
  } catch (e) {
    return { ok: false, msg: e.message };
  }
});

ipcMain.handle("pty-write", (event, id, data) => {
  const t = terminals[id];
  if (!t) return;
  if (t.type === "pty") t.handle.write(data);
  else t.handle.stdin.write(data);
});

ipcMain.handle("pty-resize", (event, id, cols, rows) => {
  const t = terminals[id];
  if (t && t.type === "pty") t.handle.resize(cols, rows);
});

ipcMain.handle("pty-kill", (event, id) => {
  const t = terminals[id];
  if (!t) return;
  if (t.type === "pty") t.handle.kill();
  else { t.handle.kill(); }
  delete terminals[id];
});

// ── IPC: Window Controls ─────────────────────────────────────────────

ipcMain.handle("window-minimize", () => { if (win) win.minimize(); });
ipcMain.handle("window-maximize", () => { if (win) { win.isMaximized() ? win.unmaximize() : win.maximize(); } });
ipcMain.handle("window-close", () => { if (win) win.close(); });
ipcMain.handle("window-set-bounds", (event, bounds) => {
  if (win) win.setBounds(bounds);
});
ipcMain.handle("window-set-on-top", (event, flag) => {
  if (win) win.setAlwaysOnTop(flag, 'floating');
});
ipcMain.handle("window-get-bounds", () => {
  if (win) return win.getBounds();
  return null;
});

// ── Window ───────────────────────────────────────────────────────────

let win;

app.whenReady().then(() => {
  configPath = path.join(app.getPath("userData"), "config.json");
  config = loadConfig();

  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 280,
    minHeight: 200,
    frame: false,
    icon: fs.existsSync(path.join(__dirname, "icon.png")) ? path.join(__dirname, "icon.png") : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.loadFile("index.html");

  startCompanion();
});

app.on("window-all-closed", async () => {
  Object.values(terminals).forEach(t => { try { t.handle.kill(); } catch {} });
  await stopCompanion();
  app.quit();
});

app.on("before-quit", async () => {
  Object.values(terminals).forEach(t => { try { t.handle.kill(); } catch {} });
  await stopCompanion();
});
