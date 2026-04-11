const fs = require("fs");
const path = require("path");

const CREATE_NO_WINDOW = 0x08000000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePrometheusMetrics(text) {
  const metrics = {};
  text.split("\n").forEach((line) => {
    if (line.startsWith("#") || !line.trim()) return;
    const match = line.match(/^([^\s{]+)(?:\{[^}]*\})?\s+(.+)$/);
    if (match) metrics[match[1]] = parseFloat(match[2]);
  });
  return Object.keys(metrics).length > 0 ? metrics : null;
}

function createServerManager({
  configStore,
  getJson,
  getText,
  killByName,
  killPid,
  logFile,
  postRequest,
  spawn,
}) {
  let serverProcess = null;

  function getPort() {
    return configStore.getActiveProfile().server.port;
  }

  function getConnectHost() {
    const host = configStore.getActiveProfile().server.host;
    if (!host || host === "0.0.0.0" || host === "::") return "127.0.0.2";
    return host;
  }

  function buildServerArgs() {
    const profile = configStore.getActiveProfile();
    const args = [
      "--model", profile.modelPath,
      "--host", profile.server.host,
      "--port", String(profile.server.port),
      "--ctx-size", String(profile.server.ctxSize),
      "--n-gpu-layers", String(profile.server.nGpuLayers),
      "--threads", String(profile.server.threads),
      "--alias", profile.alias,
      "--cache-type-k", profile.performance.cacheTypeK,
      "--cache-type-v", profile.performance.cacheTypeV,
      "--batch-size", String(profile.server.nBatch || 512),
      "--ubatch-size", String(profile.server.nUbatch || profile.server.nBatch || 512),
      "--parallel", String(profile.server.parallel || 1),
      "--metrics",
      "--slots",
      "--jinja",
    ];

    if (profile.chatTemplateFile) args.push("--chat-template-file", profile.chatTemplateFile);
    if (profile.mmprojFile) args.push("--mmproj", profile.mmprojFile);
    if (profile.performance.flashAttn) args.push("--flash-attn", "on");
    if (profile.reasoning && typeof profile.reasoning.enabled === "boolean") {
      args.push("--reasoning", profile.reasoning.enabled ? "on" : "off");
    }
    if (profile.reasoning?.enabled) args.push("--reasoning-format", profile.reasoning.format || "deepseek");
    if (profile.reasoning?.enabled && Number.isFinite(Number(profile.reasoning.budget)) && Number(profile.reasoning.budget) > 0) {
      args.push("--reasoning-budget", String(Number(profile.reasoning.budget)));
    }
    if (profile.chat.nPredict && profile.chat.nPredict > 0) args.push("--n-predict", String(profile.chat.nPredict));
    if (profile.flags.noContextShift) args.push("--no-context-shift");
    if (profile.flags.contBatching) args.push("--cont-batching");
    if (profile.flags.mlock) args.push("--mlock");
    if (profile.flags.noMmap) args.push("--no-mmap");
    if (profile.flags.extraArgs && profile.flags.extraArgs.trim()) {
      args.push(...profile.flags.extraArgs.trim().split(/\s+/));
    }

    return args;
  }

  function buildServerEnv() {
    const profile = configStore.getActiveProfile();
    const env = { ...process.env };
    if (profile.performance.cudaGraphOpt) env.GGML_CUDA_GRAPH_OPT = "1";
    if (profile.performance.cudaForceCublasCompute16F) {
      env.GGML_CUDA_FORCE_CUBLAS_COMPUTE_16F = "1";
    }
    return env;
  }

  async function checkHealth() {
    return getJson(`http://${getConnectHost()}:${getPort()}/health`, 3000, null);
  }

  function startDetachedServer() {
    return new Promise((resolve, reject) => {
      const config = configStore.getConfig();
      const logStream = fs.openSync(logFile, "w");
      const child = spawn(config.llamaServerExe, buildServerArgs(), {
        detached: true,
        stdio: ["ignore", logStream, logStream],
        env: buildServerEnv(),
        windowsHide: true,
        ...(process.platform === "win32" ? { creationFlags: CREATE_NO_WINDOW } : {}),
      });
      child.on("error", (error) => reject(error));
      fs.closeSync(logStream);
      child.unref();
      serverProcess = child;
      resolve();
    });
  }

  async function stopDetachedServer() {
    if (serverProcess && serverProcess.pid) {
      await killPid(serverProcess.pid);
      serverProcess = null;
      return;
    }

    const name = process.platform === "win32" ? "llama-server.exe" : "llama-server";
    await killByName(name);
  }

  async function waitForHealth(maxAttempts = 60, delayMs = 1000) {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      await sleep(delayMs);
      const health = await checkHealth();
      if (health) return health;
    }
    return null;
  }

  return {
    async getStatus() {
      const health = await checkHealth();
      if (!health) return { running: false, status: "stopped" };
      return { running: true, status: health.status || "ok" };
    },
    async start() {
      const health = await checkHealth();
      if (health) return { ok: true, msg: "Already running" };
      await startDetachedServer();
      return (await waitForHealth())
        ? { ok: true, msg: "Started" }
        : { ok: false, msg: "Timeout waiting for server" };
    },
    async stop() {
      await stopDetachedServer();
      await sleep(1000);
      return { ok: true, msg: "Stopped" };
    },
    async reboot() {
      await stopDetachedServer();
      await sleep(2000);
      await startDetachedServer();
      return (await waitForHealth())
        ? { ok: true, msg: "Rebooted" }
        : { ok: false, msg: "Timeout waiting for server" };
    },
    async getLogs(lineCount = 40) {
      try {
        const content = fs.readFileSync(logFile, "utf-8");
        const lines = content.split("\n");
        return lines.slice(-(lineCount || 40)).join("\n");
      } catch {
        return "(no logs)";
      }
    },
    async clearLogs() {
      try {
        fs.mkdirSync(path.dirname(logFile), { recursive: true });
        fs.writeFileSync(logFile, "", "utf-8");
        return { ok: true };
      } catch (error) {
        return { ok: false, msg: error.message };
      }
    },
    getServerInfo() {
      const profile = configStore.getActiveProfile();
      return {
        host: profile.server.host,
        connectHost: getConnectHost(),
        port: profile.server.port,
        ctxSize: profile.server.ctxSize,
        alias: profile.alias,
        modelPath: profile.modelPath,
        nGpuLayers: profile.server.nGpuLayers,
        threads: profile.server.threads,
        nBatch: profile.server.nBatch || 512,
        nUbatch: profile.server.nUbatch || profile.server.nBatch || 512,
        flashAttn: profile.performance.flashAttn,
        cacheTypeK: profile.performance.cacheTypeK,
        cacheTypeV: profile.performance.cacheTypeV,
        noContextShift: profile.flags.noContextShift,
        reasoning: profile.reasoning,
        chatTemplateFile: profile.chatTemplateFile,
      };
    },
    async getLlmMetrics() {
      const text = await getText(`http://${getConnectHost()}:${getPort()}/metrics`, 2000, null);
      return text ? parsePrometheusMetrics(text) : null;
    },
    async getLlmSlots() {
      return getJson(`http://${getConnectHost()}:${getPort()}/slots`, 2000, []);
    },
    async killAllSlots() {
      const host = getConnectHost();
      const port = getPort();
      const slots = await getJson(`http://${host}:${port}/slots`, 3000, []);
      if (!slots.length) return { ok: false, msg: "No slots found" };

      let killed = 0;
      for (const slot of slots) {
        const statusCode = await postRequest(
          { hostname: host, port, path: `/slots/${slot.id}?action=erase`, method: "POST" },
          3000
        );
        if (statusCode === 200) killed += 1;
      }

      return { ok: true, msg: `Erased ${killed}/${slots.length} slots` };
    },
  };
}

module.exports = {
  createServerManager,
};
