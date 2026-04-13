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

    if (p.serverVariant !== undefined) S.server_variant = p.serverVariant;

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
      const resolvedPredict = p.chat.nPredict !== undefined ? p.chat.nPredict : p.chat.maxTokens;
      if (resolvedPredict !== undefined) S.n_predict = resolvedPredict;
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
      if (p.performance.fitTarget !== undefined) S.fit_target = p.performance.fitTarget;
      if (p.performance.cacheRam !== undefined) S.cache_ram = p.performance.cacheRam;
      if (p.performance.threadsBatch !== undefined) S.threads_batch = p.performance.threadsBatch;
      if (p.performance.threadsHttp !== undefined) S.threads_http = p.performance.threadsHttp;
      if (p.performance.poll !== undefined) S.poll = p.performance.poll;
      if (p.performance.prio !== undefined) S.prio = p.performance.prio;
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
      if (p.reasoning.budget !== undefined) S.reasoning_budget = p.reasoning.budget;
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

