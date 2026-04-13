function showFeedback(id, text, color = "var(--gr)", timeoutMs = 2500) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.style.color = color;

  if (!showFeedback._timers) showFeedback._timers = {};
  clearTimeout(showFeedback._timers[id]);
  if (timeoutMs > 0) {
    showFeedback._timers[id] = setTimeout(() => {
      el.textContent = "";
      delete showFeedback._timers[id];
    }, timeoutMs);
  }
}

async function getLaunchProfileDetails() {
  const fallback = {
    serverExe: "llama-server",
    modelPath: "./model.gguf",
    host: "0.0.0.0",
    port: 8080,
    parallel: 1,
    alias: "",
    tmplFile: "",
    mmproj: "",
  };

  try {
    const config = await window.api.getConfig();
    const profile = config?.profiles?.[config?.activeProfile];
    if (!profile) return fallback;
    return {
      serverExe: profile.serverVariant === "turboquant"
        ? (config.llamaServerTurboExe || config.llamaServerExe || fallback.serverExe)
        : (config.llamaServerExe || fallback.serverExe),
      modelPath: profile.modelPath || fallback.modelPath,
      host: profile.server?.host ?? fallback.host,
      port: profile.server?.port ?? fallback.port,
      parallel: profile.server?.parallel ?? fallback.parallel,
      alias: profile.alias || "",
      tmplFile: profile.chatTemplateFile || "",
      mmproj: profile.mmprojFile || "",
    };
  } catch (e) {
    console.error("getLaunchProfileDetails:", e);
    return fallback;
  }
}

function buildLaunchFlagBadges({ host, port, parallel, alias, tmplFile, mmproj }) {
  const badges = [
    { t: "--host " + host, c: "b-am" },
    { t: "--port " + port, c: "b-am" },
    { t: "--ctx-size " + S.n_ctx, c: "b-cy" },
    { t: "--n-gpu-layers " + S.n_gpu_layers, c: "b-or" },
    { t: "--threads " + S.threads, c: "b-am" },
    { t: "--batch-size " + S.n_batch, c: "b-dm" },
    { t: "--ubatch-size " + (S.n_ubatch || S.n_batch), c: "b-dm" },
    { t: "--parallel " + parallel, c: "b-dm" },
    { t: "--cache-type-k " + S.cache_type_k, c: "b-cy" },
    { t: "--cache-type-v " + S.cache_type_v, c: "b-cy" },
  ];

  if (alias) badges.push({ t: "--alias " + alias, c: "b-fg3" });
  if (S.fit_target > 0) badges.push({ t: "--fit-target " + S.fit_target, c: "b-or" });
  if (Number.isFinite(S.cache_ram) && S.cache_ram !== -1) badges.push({ t: "--cache-ram " + S.cache_ram, c: "b-or" });
  if (S.threads_batch > 0) badges.push({ t: "--threads-batch " + S.threads_batch, c: "b-am" });
  if (S.threads_http > 0) badges.push({ t: "--threads-http " + S.threads_http, c: "b-am" });
  if (Number.isFinite(S.poll)) badges.push({ t: "--poll " + S.poll, c: "b-dm" });
  if (Number.isFinite(S.prio) && S.prio !== 0) badges.push({ t: "--prio " + S.prio, c: "b-dm" });
  if (S.flash_attn) badges.push({ t: "--flash-attn on", c: "b-gr" });
  if (S.no_context_shift) badges.push({ t: "--no-context-shift", c: "b-rd" });
  if (S.cont_batching) badges.push({ t: "--cont-batching", c: "b-gr" });
  if (S.mlock) badges.push({ t: "--mlock", c: "b-gr" });
  if (S.no_mmap) badges.push({ t: "--no-mmap", c: "b-rd" });
  badges.push({ t: "--reasoning " + (S.reasoning ? "on" : "off"), c: "b-vi" });
  if (S.reasoning) badges.push({ t: "--reasoning-format deepseek", c: "b-vi" });
  if (S.reasoning && Number.isFinite(Number(S.reasoning_budget)) && Number(S.reasoning_budget) > 0) {
    badges.push({ t: "--reasoning-budget " + Number(S.reasoning_budget), c: "b-vi" });
  }
  if (tmplFile) badges.push({ t: "--chat-template-file " + tmplFile, c: "b-fg3" });
  if (mmproj) badges.push({ t: "--mmproj " + mmproj, c: "b-fg3" });
  if (S.extra_args && S.extra_args.trim()) badges.push({ t: S.extra_args.trim(), c: "b-fg3" });

  return badges;
}

function sApply() {
  if (!S.system_prompt.trim()) return;
  while (chatHistory.length > 0 && chatHistory[0].role === "system") chatHistory.shift();
  chatHistory.unshift({ role: "system", content: S.system_prompt });
  showFeedback("export-feedback", "system prompt applied to next request");
}

function sClear() {
  if (typeof clearChatModuleHistory === "function") {
    clearChatModuleHistory();
    return;
  }
  chatHistory.length = 0;
  const msgs = document.getElementById("chat-msgs");
  if (msgs) clearNode(msgs);
}

async function exportCmd() {
  const details = await getLaunchProfileDetails();

  const cmd = [
    details.serverExe,
    '-m "' + details.modelPath + '"',
    ...buildLaunchFlagBadges(details).map((badge) => badge.t),
  ]
    .filter(Boolean)
    .join(" \\\n  ");

  navigator.clipboard.writeText(cmd).catch(() => {});
  showFeedback("export-feedback", "copied to clipboard");
}

function exportJSON() {
  const payload = {
    temperature: S.temperature,
    top_p: S.top_p,
    top_k: S.top_k,
    min_p: S.min_p,
    repeat_penalty: S.repeat_penalty,
    repeat_last_n: S.repeat_last_n,
    frequency_penalty: S.frequency_penalty,
    presence_penalty: S.presence_penalty,
    n_predict: S.n_predict,
    seed: S.seed,
    stop: S.stop,
    samplers: S.samplers,
  };
  navigator.clipboard.writeText(JSON.stringify(payload, null, 2)).catch(() => {});
  showFeedback("export-feedback", "JSON copied to clipboard");
}

(() => {
  const handle = document.getElementById("drag-settings");
  const col = document.getElementById("settings-col");
  if (!handle || !col) return;
  let drag = false;
  let sx = 0;
  let sw = 0;

  handle.addEventListener("mousedown", (e) => {
    drag = true;
    sx = e.clientX;
    sw = col.offsetWidth;
    handle.classList.add("on");
    document.body.style.cursor = "col-resize";
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!drag) return;
    const nw = Math.max(200, Math.min(500, sw - (e.clientX - sx)));
    col.style.width = nw + "px";
    col.style.flex = "none";
  });

  document.addEventListener("mouseup", () => {
    if (!drag) return;
    drag = false;
    handle.classList.remove("on");
    document.body.style.cursor = "";
    saveSizes();
  });
})();
