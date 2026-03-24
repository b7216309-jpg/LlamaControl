/**
 * LlamaControl — Demo Mode
 * Identical UI with fake data for screenshots.
 * Usage: npm run demo
 */

const { app, BrowserWindow, ipcMain } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const http = require("http");
const os = require("os");
let pty;
try { pty = require("node-pty"); } catch { pty = null; }

// ── Fake Data Helpers ──────────────────────────────────────────────

function vary(base, amp, periodMs) {
  return base + amp * Math.sin(Date.now() / periodMs) + (Math.random() - 0.5) * amp * 0.4;
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ── Fake System Metrics ────────────────────────────────────────────

function fakeSystemMetrics() {
  const cores = [];
  for (let i = 0; i < 16; i++) {
    const base = 20 + (i % 4) * 8;
    cores.push({ pct: clamp(vary(base, 12, 3000 + i * 400), 2, 98), temp: 0 });
  }
  const gpuUtil = clamp(vary(68, 8, 5000), 30, 95);
  const vramUsed = clamp(vary(18.4, 0.3, 8000), 16, 22);
  return {
    cpu: {
      cores,
      freq: clamp(vary(5.2, 0.15, 6000), 4.5, 5.5),
      freqMax: 5.7,
      load: [4.2, 3.8, 3.5],
      count: 16,
      brand: "AMD Ryzen 9 7950X 16-Core Processor",
    },
    gpu: {
      util: gpuUtil,
      memUtil: clamp(vary(42, 5, 4000), 20, 80),
      temp: Math.round(clamp(vary(69, 3, 7000), 58, 82)),
      power: Math.round(clamp(vary(285, 20, 5500), 180, 380)),
      fan: Math.round(clamp(vary(55, 4, 9000), 35, 80)),
      vramUsed: Math.round(vramUsed * 100) / 100,
      vramTotal: 24.0,
      vramFree: Math.round((24.0 - vramUsed) * 100) / 100,
      coreClock: Math.round(clamp(vary(2520, 60, 4000), 2100, 2700)),
    },
    mem: {
      used: clamp(vary(32.5, 1.2, 10000), 28, 42),
      cache: 4.8,
      available: 31.5,
      total: 64.0,
      pct: 50.8,
      swapUsed: 2.1,
      swapTotal: 16.0,
      swapPct: 13.1,
    },
    net: {
      dl: clamp(vary(2.2, 1.5, 3500), 0, 12),
      ul: clamp(vary(0.35, 0.25, 4500), 0, 3),
      rxTotal: "14.8 GB",
      txTotal: "3.2 GB",
    },
    disk: [
      { name: "C:\\", total: 931.5, used: 456.2, free: 475.3, pct: 49 },
      { name: "D:\\", total: 1863.0, used: 1245.8, free: 617.2, pct: 67 },
    ],
    diskIo: { read_bytes: 142000000000, write_bytes: 98000000000 },
    procs: [
      { pid: 8412, name: "llama-server", user: "user", cpu: clamp(vary(62, 8, 3000), 30, 95), mem: "18.2G", gpu: 72 },
      { pid: 12840, name: "python3", user: "user", cpu: clamp(vary(8.5, 3, 4000), 1, 20), mem: "124M", gpu: 0 },
      { pid: 4521, name: "chrome", user: "user", cpu: clamp(vary(4.2, 2, 5000), 0.5, 12), mem: "1.2G", gpu: 3 },
      { pid: 3190, name: "node", user: "user", cpu: clamp(vary(3.1, 1.5, 3500), 0.5, 8), mem: "312M", gpu: 0 },
      { pid: 7720, name: "discord", user: "user", cpu: clamp(vary(1.8, 0.8, 6000), 0.2, 5), mem: "245M", gpu: 1 },
      { pid: 2980, name: "code", user: "user", cpu: clamp(vary(1.5, 0.7, 7000), 0.2, 4), mem: "890M", gpu: 0 },
      { pid: 1124, name: "explorer", user: "user", cpu: 0.8, mem: "52M", gpu: 0 },
      { pid: 604, name: "svchost", user: "SYSTEM", cpu: 0.5, mem: "28M", gpu: 0 },
      { pid: 920, name: "audiodg", user: "SYSTEM", cpu: 0.3, mem: "18M", gpu: 0 },
    ],
    ts: Date.now() / 1000,
  };
}

// ── Fake LLM Metrics (Prometheus parsed) ───────────────────────────

let _fakeTotalPredicted = 15234;
let _fakeTotalPrompt = 8542;

function fakeLlmMetrics() {
  _fakeTotalPredicted += Math.floor(Math.random() * 3);
  _fakeTotalPrompt += Math.floor(Math.random() * 1);
  return {
    "llamacpp_predicted_tokens_seconds": clamp(vary(42.5, 4, 4000), 28, 58),
    "llamacpp_prompt_tokens_seconds": clamp(vary(312.8, 30, 6000), 200, 450),
    "llamacpp_kv_cache_usage_ratio": clamp(vary(0.37, 0.04, 8000), 0.1, 0.7),
    "llamacpp_kv_cache_full_events": 0,
    "llamacpp_prompt_tokens_total": _fakeTotalPrompt,
    "llamacpp_tokens_predicted_total": _fakeTotalPredicted,
    "llamacpp_requests_processing": 0,
    "llamacpp_requests_deferred": 0,
    "llamacpp_n_decode_total": 47,
    "llamacpp_prompt_seconds_total": 27.3,
    "llamacpp_tokens_predicted_seconds_total": 358.1,
  };
}

// ── Fake Slot Data ─────────────────────────────────────────────────

function fakeLlmSlots() {
  return [{
    id: 0,
    id_task: 47,
    is_processing: false,
    state: 0,
    n_past: 12456,
    n_ctx: 81920,
    tokens_predicted: 8234,
    tokens_evaluated: 4222,
    think_tokens: 3120,
    timing_prompt_ms: 124.5,
    timing_think_ms: 72400,
    timing_predicted_ms: 193500,
    prompt: "Can you explain how attention mechanisms work in transformer architectures?",
    params: {
      temperature: 1.0,
      top_p: 0.95,
      top_k: 20,
      min_p: 0.05,
    },
  }];
}

// ── Fake Config ────────────────────────────────────────────────────

const DEMO_CONFIG = {
  version: 2,
  llamaServerExe: process.platform === "win32" ? "C:\\Tools\\llama-cpp\\llama-server.exe" : "/usr/local/bin/llama-server",
  modelsDirectory: path.join(os.homedir(), "Models"),
  activeProfile: "Thinking General",
  profiles: {
    "Thinking General": {
      name: "Thinking General",
      modelPath: path.join(os.homedir(), "Models", "Qwen3.5-32B-Instruct-Q5_K_M.gguf"),
      alias: "Qwen3.5-32B-Instruct-Q5_K_M",
      chatTemplateFile: path.join(os.homedir(), "Models", "chat_template.jinja"),
      mmprojFile: "",
      server: { host: "0.0.0.0", port: 8080, ctxSize: 81920, nGpuLayers: 99, threads: 4, nBatch: 4096 },
      performance: { flashAttn: true, cacheTypeK: "q8_0", cacheTypeV: "q8_0", cudaGraphOpt: true, cudaForceCublasCompute16F: true },
      reasoning: { enabled: true, format: "deepseek" },
      chat: {
        maxTokens: 81920, temperature: 1.0, topP: 0.95, topK: 20, minP: 0.05,
        presencePenalty: 0.9, repetitionPenalty: 1.0,
        seed: -1, repeatLastN: 256, frequencyPenalty: 0, nPredict: -1,
        samplers: ["top_k", "tfs_z", "typical_p", "top_p", "min_p", "temperature"],
        stop: ["<|im_end|>", "<|endoftext|>"],
        systemPrompt: "",
      },
      flags: { noContextShift: true, extraArgs: "", contBatching: true, mlock: true },
    },
    "Thinking Code": {
      name: "Thinking Code",
      modelPath: path.join(os.homedir(), "Models", "Qwen3.5-32B-Instruct-Q5_K_M.gguf"),
      alias: "Qwen3.5-32B-Instruct-Q5_K_M",
      chatTemplateFile: path.join(os.homedir(), "Models", "chat_template.jinja"),
      mmprojFile: "",
      server: { host: "0.0.0.0", port: 8080, ctxSize: 81920, nGpuLayers: 99, threads: 4, nBatch: 4096 },
      performance: { flashAttn: true, cacheTypeK: "q8_0", cacheTypeV: "q8_0", cudaGraphOpt: true, cudaForceCublasCompute16F: true },
      reasoning: { enabled: true, format: "deepseek" },
      chat: {
        maxTokens: 81920, temperature: 0.6, topP: 0.95, topK: 20, minP: 0.05,
        presencePenalty: 0.0, repetitionPenalty: 1.0,
        seed: -1, repeatLastN: 256, frequencyPenalty: 0, nPredict: -1,
        samplers: ["top_k", "tfs_z", "typical_p", "top_p", "min_p", "temperature"],
        stop: ["<|im_end|>", "<|endoftext|>"],
        systemPrompt: "",
      },
      flags: { noContextShift: true, extraArgs: "", contBatching: true, mlock: true },
    },
    "Fast Chat": {
      name: "Fast Chat",
      modelPath: path.join(os.homedir(), "Models", "Qwen3.5-32B-Instruct-Q5_K_M.gguf"),
      alias: "Qwen3.5-32B-Instruct-Q5_K_M",
      chatTemplateFile: path.join(os.homedir(), "Models", "chat_template.jinja"),
      mmprojFile: "",
      server: { host: "0.0.0.0", port: 8080, ctxSize: 81920, nGpuLayers: 99, threads: 4, nBatch: 4096 },
      performance: { flashAttn: true, cacheTypeK: "q8_0", cacheTypeV: "q8_0", cudaGraphOpt: true, cudaForceCublasCompute16F: true },
      reasoning: { enabled: false, format: "deepseek" },
      chat: {
        maxTokens: 8192, temperature: 0.7, topP: 0.8, topK: 20, minP: 0.05,
        presencePenalty: 0.9, repetitionPenalty: 1.0,
        seed: -1, repeatLastN: 256, frequencyPenalty: 0, nPredict: -1,
        samplers: ["top_k", "tfs_z", "typical_p", "top_p", "min_p", "temperature"],
        stop: ["<|im_end|>", "<|endoftext|>"],
        systemPrompt: "",
      },
      flags: { noContextShift: true, extraArgs: "", contBatching: true, mlock: true },
    },
  },
};

// ── Fake Log Lines ─────────────────────────────────────────────────

const FAKE_LOGS = [
  "main: server is listening on http://0.0.0.0:8080",
  "main: model loaded in 4.82s",
  "srv  load_model: VRAM used: 18124.00 MiB",
  "slot 0: new request, n_ctx = 81920",
  "slot 0: prompt eval done, n_past = 4222, duration = 124.50ms, speed = 33920.00 t/s",
  "slot 0: generating, n_predict = -1",
  "slot 0: think 3120 tokens in 72.40s (43.09 t/s)",
  "slot 0: output 5114 tokens in 121.10s (42.23 t/s)",
  "slot 0: done, total 8234 tokens in 193.50s",
  "slot 0: kv cache rm [4222, end)",
  "srv  request complete: 200 OK",
  "slot 0: new request, n_ctx = 81920",
  "slot 0: prompt eval done, n_past = 8912, duration = 98.20ms, speed = 41242.00 t/s",
  "slot 0: generating, n_predict = -1",
  "slot 0: think 1842 tokens in 42.80s (43.04 t/s)",
  "slot 0: output 2890 tokens in 68.20s (42.38 t/s)",
  "slot 0: done, total 4732 tokens in 111.00s",
  "srv  request complete: 200 OK",
].join("\n");

// ── Fake HTTP Server (LLM endpoints) ──────────────────────────────

const THINKING_TEXT = `The user is asking me a question. Let me analyze what they need and provide a clear, well-structured response. I should consider the technical aspects and explain them in an accessible way while being thorough.`;

const CANNED_RESPONSES = [
  "I'd be happy to help with that! The key concept here is that transformer architectures use self-attention to weigh the importance of different parts of the input sequence relative to each other. This allows the model to capture long-range dependencies that were difficult for earlier architectures like RNNs.\n\nThe attention mechanism works by computing three vectors for each token: Query (Q), Key (K), and Value (V). The attention score between any two tokens is the dot product of the query of one with the key of the other, scaled by the square root of the dimension. These scores are then passed through a softmax function to create a probability distribution, which is used to create a weighted sum of the value vectors.\n\nMulti-head attention extends this by running several attention operations in parallel, each with different learned projections, allowing the model to attend to information from different representation subspaces simultaneously.",
  "Great question! Let me break this down step by step.\n\nFirst, the model tokenizes the input text into a sequence of tokens. Each token is mapped to an embedding vector. Positional encodings are added to give the model information about the order of tokens in the sequence.\n\nThe core of the transformer is the attention mechanism, which computes:\n\n  Attention(Q, K, V) = softmax(QK^T / sqrt(d_k)) * V\n\nThis allows each position in the sequence to attend to all other positions, creating context-aware representations. The multi-head variant runs this in parallel across several \"heads\", each learning different aspects of the relationships between tokens.\n\nThe output is then passed through feed-forward layers with residual connections and layer normalization, building increasingly abstract representations through the network's depth.",
];

function startFakeLlmServer() {
  const server = http.createServer((req, res) => {
    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));

    } else if (req.url === "/metrics") {
      const m = fakeLlmMetrics();
      let text = "";
      for (const [k, v] of Object.entries(m)) text += `${k} ${v}\n`;
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(text);

    } else if (req.url === "/slots") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(fakeLlmSlots()));

    } else if (req.url === "/v1/chat/completions" && req.method === "POST") {
      let body = "";
      req.on("data", c => body += c);
      req.on("end", () => {
        res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" });
        const response = CANNED_RESPONSES[Math.floor(Math.random() * CANNED_RESPONSES.length)];
        const thinkTokens = THINKING_TEXT.split(/(\s+)/);
        const contentTokens = response.split(/(\s+)/);
        let i = 0;

        // Stream thinking tokens
        function streamThink() {
          if (i < thinkTokens.length) {
            const delta = { reasoning_content: thinkTokens[i] };
            res.write(`data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`);
            i++;
            setTimeout(streamThink, 18 + Math.random() * 12);
          } else {
            i = 0;
            setTimeout(streamContent, 40);
          }
        }
        // Stream content tokens
        function streamContent() {
          if (i < contentTokens.length) {
            const delta = { content: contentTokens[i] };
            const obj = { choices: [{ delta }] };
            // Add timings on last token
            if (i === contentTokens.length - 1) {
              obj.timings = {
                predicted_per_second: 42.5,
                prompt_ms: 124.5,
                predicted_ms: (contentTokens.length * 23),
                predicted_n: contentTokens.length,
              };
            }
            res.write(`data: ${JSON.stringify(obj)}\n\n`);
            i++;
            setTimeout(streamContent, 18 + Math.random() * 14);
          } else {
            res.write("data: [DONE]\n\n");
            res.end();
          }
        }
        streamThink();
      });

    } else {
      res.writeHead(404);
      res.end("Not found");
    }
  });
  server.listen(8080, () => console.log("[demo] Fake LLM server on :8080"));
  return server;
}

// ── IPC Handlers ───────────────────────────────────────────────────

function registerIPC(win) {
  ipcMain.handle("get-status", async () => ({ running: true, status: "ok" }));
  ipcMain.handle("start-server", async () => ({ ok: true, msg: "Already running (demo)" }));
  ipcMain.handle("stop-server", async () => ({ ok: true, msg: "Stopped (demo)" }));
  ipcMain.handle("reboot-server", async () => ({ ok: true, msg: "Rebooted (demo)" }));
  ipcMain.handle("get-logs", async () => FAKE_LOGS);
  ipcMain.handle("get-system-metrics", async () => fakeSystemMetrics());
  ipcMain.handle("get-llm-metrics", async () => fakeLlmMetrics());
  ipcMain.handle("get-llm-slots", async () => fakeLlmSlots());
  ipcMain.handle("start-companion", async () => ({ ok: true }));
  ipcMain.handle("stop-companion", async () => ({ ok: true }));

  ipcMain.handle("get-server-info", async () => {
    const p = DEMO_CONFIG.profiles[DEMO_CONFIG.activeProfile];
    return {
      host: p.server.host, port: p.server.port, ctxSize: p.server.ctxSize,
      alias: p.alias, modelPath: p.modelPath,
      nGpuLayers: p.server.nGpuLayers, threads: p.server.threads,
      nBatch: p.server.nBatch, flashAttn: p.performance.flashAttn,
      cacheTypeK: p.performance.cacheTypeK, cacheTypeV: p.performance.cacheTypeV,
      noContextShift: p.flags.noContextShift, reasoning: p.reasoning,
      chatTemplateFile: p.chatTemplateFile,
    };
  });

  // Chat — handled by fake HTTP server, but keep IPC stubs
  ipcMain.handle("chat-send", async () => ({ ok: true }));
  ipcMain.handle("chat-stop", async () => ({ ok: true }));

  // Config & profiles — read-only in demo
  ipcMain.handle("get-config", async () => DEMO_CONFIG);
  ipcMain.handle("save-config", async () => ({ ok: true }));
  ipcMain.handle("get-profiles", async () => ({ profiles: DEMO_CONFIG.profiles, activeProfile: DEMO_CONFIG.activeProfile }));
  ipcMain.handle("save-profile", async () => ({ ok: true }));
  ipcMain.handle("delete-profile", async () => ({ ok: false, msg: "Demo mode" }));
  ipcMain.handle("set-active-profile", async () => ({ ok: true }));

  ipcMain.handle("scan-models", async () => [
    { path: path.join(os.homedir(), "Models", "Qwen3.5-32B-Instruct-Q5_K_M.gguf"), name: "Qwen3.5-32B-Instruct-Q5_K_M", sizeBytes: 22_500_000_000, sizeDisplay: "21.0 GB", chatTemplateFile: path.join(os.homedir(), "Models", "chat_template.jinja"), mmprojFile: null, directory: path.join(os.homedir(), "Models") },
    { path: path.join(os.homedir(), "Models", "Llama-3.1-70B-Q4_K_M.gguf"), name: "Llama-3.1-70B-Q4_K_M", sizeBytes: 40_300_000_000, sizeDisplay: "37.5 GB", chatTemplateFile: null, mmprojFile: null, directory: path.join(os.homedir(), "Models") },
    { path: path.join(os.homedir(), "Models", "DeepSeek-R1-14B-Q6_K.gguf"), name: "DeepSeek-R1-14B-Q6_K", sizeBytes: 11_800_000_000, sizeDisplay: "11.0 GB", chatTemplateFile: path.join(os.homedir(), "Models", "chat_template.jinja"), mmprojFile: null, directory: path.join(os.homedir(), "Models") },
  ]);

  ipcMain.handle("kill-process", async () => ({ ok: true, msg: "killed (demo)" }));

  // Terminal — real PTY if available
  const terminals = {};
  ipcMain.handle("pty-create", (event, id, shellCmd) => {
    if (terminals[id]) return { ok: true, msg: "already exists" };
    const shell = shellCmd || (process.platform === "win32" ? "powershell.exe" : "bash");
    if (pty) {
      try {
        const term = pty.spawn(shell, [], { name: "xterm-256color", cols: 120, rows: 30, cwd: os.homedir(), env: process.env });
        terminals[id] = { type: "pty", handle: term };
        term.onData(data => { if (win && !win.isDestroyed()) win.webContents.send("pty-data", id, data); });
        term.onExit(() => { delete terminals[id]; if (win && !win.isDestroyed()) win.webContents.send("pty-exit", id); });
        return { ok: true, mode: "pty" };
      } catch {}
    }
    try {
      const child = spawn(shell, [], { cwd: os.homedir(), env: { ...process.env, TERM: "xterm-256color" }, stdio: ["pipe", "pipe", "pipe"] });
      terminals[id] = { type: "proc", handle: child };
      child.stdout.on("data", data => { if (win && !win.isDestroyed()) win.webContents.send("pty-data", id, data.toString()); });
      child.stderr.on("data", data => { if (win && !win.isDestroyed()) win.webContents.send("pty-data", id, data.toString()); });
      child.on("exit", () => { delete terminals[id]; if (win && !win.isDestroyed()) win.webContents.send("pty-exit", id); });
      return { ok: true, mode: "spawn" };
    } catch (e) { return { ok: false, msg: e.message }; }
  });
  ipcMain.handle("pty-write", (event, id, data) => { const t = terminals[id]; if (!t) return; if (t.type === "pty") t.handle.write(data); else t.handle.stdin.write(data); });
  ipcMain.handle("pty-resize", (event, id, cols, rows) => { const t = terminals[id]; if (t && t.type === "pty") t.handle.resize(cols, rows); });
  ipcMain.handle("pty-kill", (event, id) => { const t = terminals[id]; if (!t) return; t.handle.kill(); delete terminals[id]; });

  // Window controls — real
  ipcMain.handle("window-minimize", () => { if (win) win.minimize(); });
  ipcMain.handle("window-maximize", () => { if (win) { win.isMaximized() ? win.unmaximize() : win.maximize(); } });
  ipcMain.handle("window-close", () => { if (win) win.close(); });
  ipcMain.handle("window-set-bounds", (event, bounds) => { if (win) win.setBounds(bounds); });
  ipcMain.handle("window-set-on-top", (event, flag) => { if (win) win.setAlwaysOnTop(flag, "floating"); });
  ipcMain.handle("window-get-bounds", () => win ? win.getBounds() : null);
}

// ── Inject Fake Chat History (after page load) ─────────────────────

function injectDemoData(win) {
  win.webContents.executeJavaScript(`
    // Pre-fill chat conversation
    chatAddMsg('user', 'Can you explain how attention mechanisms work in transformer architectures?');
    chatAddMsg('thinking', 'The user is asking about attention mechanisms in transformers. This is a fundamental concept in modern deep learning. Let me provide a clear explanation covering the key components: Query, Key, Value vectors, scaled dot-product attention, and multi-head attention. I should also mention why this architecture was revolutionary compared to RNNs.');
    chatAddMsg('assistant', 'The attention mechanism is the core innovation of the transformer architecture. Here is how it works:\\n\\nFor each token in the input sequence, the model computes three vectors:\\n- Query (Q): what this token is looking for\\n- Key (K): what this token contains\\n- Value (V): the actual information to pass forward\\n\\nThe attention score between any two tokens is computed as:\\n\\n  Attention(Q, K, V) = softmax(QK^T / sqrt(d_k)) * V\\n\\nThe scaling factor sqrt(d_k) prevents the dot products from growing too large, which would push the softmax into regions with extremely small gradients.\\n\\nMulti-head attention runs several attention operations in parallel, each with different learned projection matrices. This allows the model to jointly attend to information from different representation subspaces at different positions.');

    // Toggle thinking visibility to show it's there
    if (_thinkHidden) toggleThinkVisibility();

    // Pre-fill request history
    reqHist.unshift(
      { now: '14:32:18', prompt: 'Can you explain how attention mec...', thk: 3120, out: 5114, tpsVal: '42.5', ttftVal: '124ms', totVal: '193.5s' },
      { now: '14:28:05', prompt: 'What are the main differences bet...', thk: 1842, out: 2890, tpsVal: '42.3', ttftVal: '98ms', totVal: '111.0s' },
      { now: '14:22:41', prompt: 'Explain the concept of KV cache i...', thk: 956, out: 1440, tpsVal: '43.1', ttftVal: '112ms', totVal: '55.6s' },
      { now: '14:15:12', prompt: 'How does flash attention improve p...', thk: 2240, out: 3870, tpsVal: '41.8', ttftVal: '145ms', totVal: '146.2s' }
    );
    _renderHistory();
  `).catch(() => {});
}

// ── Window ─────────────────────────────────────────────────────────

let win;
let fakeLlmServer;

app.whenReady().then(() => {
  fakeLlmServer = startFakeLlmServer();

  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 280,
    minHeight: 200,
    frame: false,
    icon: fs.existsSync(path.join(__dirname, "icon.png")) ? path.join(__dirname, "icon.png") : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });
  win.setMenuBarVisibility(false);
  registerIPC(win);
  win.loadFile("index.html");

  // Inject fake chat + history once the page is ready
  win.webContents.on("did-finish-load", () => {
    setTimeout(() => injectDemoData(win), 1500);
  });
});

app.on("window-all-closed", () => {
  if (fakeLlmServer) fakeLlmServer.close();
  app.quit();
});
