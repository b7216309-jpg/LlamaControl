async function initPorts() {
  try {
    const info = await window.api.getServerInfo();
    if (!info) return;
    const connectHost = info.connectHost || ((info.host === "0.0.0.0" || info.host === "::" || !info.host) ? "127.0.0.2" : info.host);
    const displayHost = (info.host === "0.0.0.0" || info.host === "::" || !info.host) ? "local" : info.host;
    LLM_CHAT_URL = "http://" + connectHost + ":" + info.port + "/v1/chat/completions";
    _CTX = info.ctxSize || 81920;
    const ctxLabel = document.getElementById("ctx-cap-label");
    if (ctxLabel) ctxLabel.textContent = "Context - " + _CTX.toLocaleString();
    document.getElementById("tb-model").textContent = (info.alias || "llama-server") + " - " + displayHost + ":" + info.port;
  } catch (e) { console.error("initPorts:", e); }
}

async function initSettings() {
  try {
    const config = await window.api.getConfig();
    if (!config) return;
    const p = config.profiles[config.activeProfile] || Object.values(config.profiles)[0];
    if (!p) return;

    if (p.chat) {
      if (p.chat.temperature !== undefined) S.temperature = p.chat.temperature;
      if (p.chat.topP !== undefined) S.top_p = p.chat.topP;
      if (p.chat.topK !== undefined) S.top_k = p.chat.topK;
      if (p.chat.minP !== undefined) S.min_p = p.chat.minP;
      if (p.chat.presencePenalty !== undefined) S.presence_penalty = p.chat.presencePenalty;
      if (p.chat.repetitionPenalty !== undefined) S.repeat_penalty = p.chat.repetitionPenalty;
      if (p.chat.frequencyPenalty !== undefined) S.frequency_penalty = p.chat.frequencyPenalty;
      if (p.chat.repeatLastN !== undefined) S.repeat_last_n = p.chat.repeatLastN;
      if (p.chat.seed !== undefined) S.seed = p.chat.seed;
      if (p.chat.nPredict !== undefined) S.n_predict = p.chat.nPredict;
      if (p.chat.samplers) S.samplers = [...p.chat.samplers];
      if (p.chat.stop) S.stop = [...p.chat.stop];
      if (p.chat.systemPrompt !== undefined) S.system_prompt = p.chat.systemPrompt;
    }

    if (p.server) {
      if (p.server.ctxSize !== undefined) S.n_ctx = p.server.ctxSize;
      if (p.server.nGpuLayers !== undefined) S.n_gpu_layers = p.server.nGpuLayers;
      if (p.server.threads !== undefined) S.threads = p.server.threads;
      if (p.server.nBatch !== undefined) S.n_batch = p.server.nBatch;
      if (p.server.nUbatch !== undefined) S.n_ubatch = p.server.nUbatch;
    }

    if (p.performance) {
      if (p.performance.flashAttn !== undefined) S.flash_attn = p.performance.flashAttn;
      if (p.performance.cacheTypeK !== undefined) S.cache_type_k = p.performance.cacheTypeK;
      if (p.performance.cacheTypeV !== undefined) S.cache_type_v = p.performance.cacheTypeV;
      if (p.performance.cudaGraphOpt !== undefined) S.cuda_graph_opt = !!p.performance.cudaGraphOpt;
      if (p.performance.cudaForceCublasCompute16F !== undefined) S.cuda_fp16 = !!p.performance.cudaForceCublasCompute16F;
    }

    if (p.flags) {
      if (p.flags.noContextShift !== undefined) S.no_context_shift = p.flags.noContextShift;
      if (p.flags.contBatching !== undefined) S.cont_batching = p.flags.contBatching;
      if (p.flags.mlock !== undefined) S.mlock = p.flags.mlock;
      if (p.flags.noMmap !== undefined) S.no_mmap = p.flags.noMmap;
      if (p.flags.extraArgs !== undefined) S.extra_args = p.flags.extraArgs;
    }

    if (p.chat && p.chat.cachePrompt !== undefined) S.cache_prompt = !!p.chat.cachePrompt;

    if (p.reasoning) {
      S.reasoning = !!p.reasoning.enabled;
    }

    if (p.chatTemplateFile) {
      S.chat_template = "jinja";
    }

    if (p.chat && p.chat.systemPrompt) {
      const sp = document.getElementById("s-sysprompt");
      if (sp) sp.value = p.chat.systemPrompt;
    }

    syncGaugesToSettings();
    buildSamplerList();
    renderStops();
    if (typeof updateFlags === "function") updateFlags();
  } catch (e) {
    console.error("initSettings error:", e);
  }
}

function syncGaugesToSettings() {
  const gaugeMap = {
    "s-temp": { key: "temperature", fmt: "f2" },
    "s-topp": { key: "top_p", fmt: "f2" },
    "s-topk": { key: "top_k", fmt: "i" },
    "s-minp": { key: "min_p", fmt: "f2" },
    "s-rep": { key: "repeat_penalty", fmt: "f2" },
    "s-repn": { key: "repeat_last_n", fmt: "i" },
    "s-freq": { key: "frequency_penalty", fmt: "f2" },
    "s-pres": { key: "presence_penalty", fmt: "f2" },
    "s-npred": { key: "n_predict", fmt: "inf" },
    "s-nctx": { key: "n_ctx", fmt: "i" },
    "s-nbatch": { key: "n_batch", fmt: "i" },
    "s-nubatch": { key: "n_ubatch", fmt: "i" },
    "s-ngl": { key: "n_gpu_layers", fmt: "i" },
    "s-thr": { key: "threads", fmt: "i" },
  };

  for (const [id, { key }] of Object.entries(gaugeMap)) {
    const el = document.getElementById(id);
    if (!el || S[key] === undefined) continue;
    el.dataset.val = S[key];
    blkRender(el);
    const valEl = document.getElementById("sv-" + id.slice(2));
    if (valEl) valEl.textContent = blkFmt(el, S[key]);
  }

  const chkMap = {
    "s-fa": "flash_attn",
    "s-ncs": "no_context_shift",
    "s-cont": "cont_batching",
    "s-mlock": "mlock",
    "s-nommap": "no_mmap",
    "s-cacheprompt": "cache_prompt",
  };
  for (const [id, key] of Object.entries(chkMap)) {
    const el = document.getElementById(id);
    if (el) el.checked = !!S[key];
  }

  const selMap = {
    "s-ctk": "cache_type_k",
    "s-ctv": "cache_type_v",
    "s-tmpl": "chat_template",
  };
  for (const [id, key] of Object.entries(selMap)) {
    const el = document.getElementById(id);
    if (el && S[key]) el.value = S[key];
  }

  const extraArgsEl = document.getElementById("s-extraargs");
  if (extraArgsEl) extraArgsEl.value = S.extra_args || "";

  const seedSync = document.getElementById("s-seed");
  if (seedSync) seedSync.value = S.seed;

  const thinkEl = document.getElementById("s-think");
  if (thinkEl) thinkEl.checked = !!S.reasoning;
}

async function saveSettingsToConfig() {
  try {
    const config = await window.api.getConfig();
    const profileName = config.activeProfile;
    const p = config.profiles[profileName];
    if (!p) return;

    p.chat.temperature = S.temperature;
    p.chat.topP = S.top_p;
    p.chat.topK = S.top_k;
    p.chat.minP = S.min_p;
    p.chat.presencePenalty = S.presence_penalty;
    p.chat.repetitionPenalty = S.repeat_penalty;
    p.chat.frequencyPenalty = S.frequency_penalty;
    p.chat.repeatLastN = S.repeat_last_n;
    p.chat.seed = S.seed;
    p.chat.nPredict = S.n_predict;
    p.chat.samplers = [...S.samplers];
    p.chat.stop = [...S.stop];
    p.chat.systemPrompt = S.system_prompt;
    p.server.ctxSize = S.n_ctx;
    p.server.nGpuLayers = S.n_gpu_layers;
    p.server.threads = S.threads;
    p.server.nBatch = S.n_batch;
    p.server.nUbatch = S.n_ubatch;
    p.performance.flashAttn = S.flash_attn;
    p.performance.cacheTypeK = S.cache_type_k;
    p.performance.cacheTypeV = S.cache_type_v;
    p.flags.noContextShift = S.no_context_shift;
    p.flags.contBatching = S.cont_batching;
    p.flags.mlock = S.mlock;
    p.flags.noMmap = S.no_mmap;
    p.flags.extraArgs = S.extra_args || "";
    p.chat.cachePrompt = !!S.cache_prompt;
    p.reasoning.enabled = !!S.reasoning;

    if (S.chat_template !== "jinja") {
      p.chatTemplateFile = "";
    }

    await window.api.saveConfig(config);
    if (typeof updateFlags === "function") updateFlags();
  } catch (e) {
    console.error("saveSettingsToConfig error:", e);
  }
}
