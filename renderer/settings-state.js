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
    "s-rbud": { key: "reasoning_budget", fmt: "budget" },
    "s-fitt": { key: "fit_target", fmt: "i" },
    "s-cram": { key: "cache_ram", fmt: "i" },
    "s-thb": { key: "threads_batch", fmt: "i" },
    "s-thh": { key: "threads_http", fmt: "i" },
    "s-poll": { key: "poll", fmt: "i" },
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
    "s-prio": "prio",
    "s-tmpl": "chat_template",
  };
  for (const [id, key] of Object.entries(selMap)) {
    const el = document.getElementById(id);
    if (el && S[key]) el.value = S[key];
  }

  const variantEl = document.getElementById("s-variant");
  if (variantEl) variantEl.value = S.server_variant || "standard";

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

    p.serverVariant = S.server_variant || "standard";

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
    if (S.n_predict > 0) p.chat.maxTokens = S.n_predict;
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
    p.performance.fitTarget = S.fit_target;
    p.performance.cacheRam = S.cache_ram;
    p.performance.threadsBatch = S.threads_batch;
    p.performance.threadsHttp = S.threads_http;
    p.performance.poll = S.poll;
    p.performance.prio = S.prio;
    p.flags.noContextShift = S.no_context_shift;
    p.flags.contBatching = S.cont_batching;
    p.flags.mlock = S.mlock;
    p.flags.noMmap = S.no_mmap;
    p.flags.extraArgs = S.extra_args || "";
    p.chat.cachePrompt = !!S.cache_prompt;
    p.reasoning.enabled = !!S.reasoning;
    p.reasoning.budget = S.reasoning_budget;

    if (S.chat_template !== "jinja") {
      p.chatTemplateFile = "";
    }

    await window.api.saveConfig(config);
    if (typeof updateFlags === "function") updateFlags();
  } catch (e) {
    console.error("saveSettingsToConfig error:", e);
  }
}

