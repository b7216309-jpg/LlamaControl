const S = {
  temperature: 0.7,
  top_p: 0.9,
  top_k: 40,
  min_p: 0.05,
  repeat_penalty: 1.1,
  repeat_last_n: 64,
  frequency_penalty: 0,
  presence_penalty: 0,
  n_predict: -1,
  seed: -1,
  n_ctx: 81920,
  n_batch: 512,
  n_gpu_layers: 99,
  threads: 4,
  flash_attn: true,
  no_context_shift: true,
  cont_batching: false,
  mlock: false,
  cache_type_k: "q8_0",
  cache_type_v: "q8_0",
  chat_template: "jinja",
  reasoning: true,
  system_prompt: "",
  stop: [],
  samplers: ["top_k", "tfs_z", "typical_p", "top_p", "min_p", "temperature"],
};

function sSet(key, val) {
  S[key] = val;
  clearTimeout(sSet._timer);
  sSet._timer = setTimeout(saveSettingsToConfig, 800);
}

const BLOCKS = 16;

function blkRender(el) {
  const min = parseFloat(el.dataset.min);
  const max = parseFloat(el.dataset.max);
  const val = parseFloat(el.dataset.val);
  const ratio = Math.max(0, Math.min(1, (val - min) / (max - min)));
  const filled = Math.round(ratio * BLOCKS);
  el.textContent = "#".repeat(filled) + "-".repeat(BLOCKS - filled);
}

function blkFmt(el, val) {
  const fmt = el.dataset.fmt;
  if (fmt === "f2") return parseFloat(val).toFixed(2);
  if (fmt === "i") return String(Math.round(val));
  if (fmt === "inf") return parseFloat(val) <= -1 ? "INF" : String(Math.round(val));
  return String(val);
}

function blkSet(el, ratio) {
  const min = parseFloat(el.dataset.min);
  const max = parseFloat(el.dataset.max);
  const step = parseFloat(el.dataset.step);
  let raw = min + ratio * (max - min);
  raw = Math.round(raw / step) * step;
  raw = Math.max(min, Math.min(max, raw));
  el.dataset.val = raw;
  const valEl = document.getElementById("sv-" + el.id.slice(2));
  if (valEl) {
    valEl.textContent = blkFmt(el, raw);
    valEl.style.color = "var(--or)";
  }
  sSet(el.dataset.key, raw);
  blkRender(el);
}

document.querySelectorAll(".blk-gauge").forEach((el) => {
  blkRender(el);

  let dragging = false;

  const getRatio = (e) => {
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  };

  el.addEventListener("mousedown", (e) => {
    dragging = true;
    el.classList.add("active");
    blkSet(el, getRatio(e));
    e.preventDefault();
  });

  el.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const min = parseFloat(el.dataset.min);
      const max = parseFloat(el.dataset.max);
      const step = parseFloat(el.dataset.step);
      let val = parseFloat(el.dataset.val) + (e.deltaY < 0 ? step : -step);
      val = Math.max(min, Math.min(max, Math.round(val / step) * step));
      el.dataset.val = val;
      const valEl = document.getElementById("sv-" + el.id.slice(2));
      if (valEl) {
        valEl.textContent = blkFmt(el, val);
        valEl.style.color = "var(--or)";
      }
      sSet(el.dataset.key, val);
      blkRender(el);
    },
    { passive: false }
  );

  document.addEventListener("mousemove", (e) => {
    if (dragging) blkSet(el, getRatio(e));
  });
  document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove("active");
  });
});

const seedEl = document.getElementById("s-seed");
if (seedEl) {
  seedEl.addEventListener("input", () => sSet("seed", parseInt(seedEl.value, 10) || -1));
}

const spEl = document.getElementById("s-sysprompt");
if (spEl) {
  spEl.addEventListener("input", () => sSet("system_prompt", spEl.value));
}

function buildSamplerList() {
  const list = document.getElementById("sampler-list");
  if (!list) return;
  clearNode(list);
  S.samplers.forEach((name, i) => {
    const div = document.createElement("div");
    div.className = "sampler-item";
    div.draggable = true;
    div.dataset.idx = i;
    div.appendChild(createSpan("sampler-handle", "::"));
    div.appendChild(createSpan("", name));
    const order = createSpan("", String(i + 1));
    order.style.cssText = "margin-left:auto;font-size:9px;color:var(--fg3)";
    div.appendChild(order);
    div.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", i);
      div.style.opacity = ".4";
    });
    div.addEventListener("dragend", () => {
      div.style.opacity = "1";
      list.querySelectorAll(".sampler-item").forEach((item) => item.classList.remove("drag-over"));
    });
    div.addEventListener("dragover", (e) => {
      e.preventDefault();
      div.classList.add("drag-over");
    });
    div.addEventListener("dragleave", () => div.classList.remove("drag-over"));
    div.addEventListener("drop", (e) => {
      e.preventDefault();
      const from = parseInt(e.dataTransfer.getData("text/plain"), 10);
      const to = parseInt(div.dataset.idx, 10);
      if (from === to) return;
      const moved = S.samplers.splice(from, 1)[0];
      S.samplers.splice(to, 0, moved);
      buildSamplerList();
      clearTimeout(sSet._timer);
      sSet._timer = setTimeout(saveSettingsToConfig, 800);
    });
    list.appendChild(div);
  });
}
buildSamplerList();

function renderStops() {
  const cont = document.getElementById("stop-tags");
  if (!cont) return;
  clearNode(cont);
  S.stop.forEach((s, i) => {
    const tag = document.createElement("div");
    tag.className = "stop-tag";
    const label = createSpan("", s === "\n" ? "\\n" : s);
    const removeBtn = document.createElement("button");
    removeBtn.textContent = "x";
    removeBtn.addEventListener("click", () => stopRemove(i));
    tag.appendChild(label);
    tag.appendChild(removeBtn);
    cont.appendChild(tag);
  });
}

function stopAdd() {
  const inp = document.getElementById("stop-input");
  if (!inp || !inp.value.trim()) return;
  S.stop.push(inp.value.trim());
  inp.value = "";
  renderStops();
  clearTimeout(sSet._timer);
  sSet._timer = setTimeout(saveSettingsToConfig, 800);
}

function stopRemove(i) {
  S.stop.splice(i, 1);
  renderStops();
  clearTimeout(sSet._timer);
  sSet._timer = setTimeout(saveSettingsToConfig, 800);
}

document.getElementById("stop-input")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") stopAdd();
});

S.stop = ["<|im_end|>", "<|endoftext|>"];
renderStops();

function sApply() {
  if (!S.system_prompt.trim()) return;
  while (chatHistory.length > 0 && chatHistory[0].role === "system") chatHistory.shift();
  chatHistory.unshift({ role: "system", content: S.system_prompt });
  const fb = document.getElementById("export-feedback");
  if (!fb) return;
  fb.textContent = "system prompt applied to next request";
  fb.style.color = "var(--gr)";
  setTimeout(() => {
    fb.textContent = "";
  }, 2500);
}

function sClear() {
  chatHistory.length = 0;
  const msgs = document.getElementById("chat-msgs");
  if (msgs) clearNode(msgs);
}

async function exportCmd() {
  let serverExe = "llama-server";
  let modelPath = "./model.gguf";
  try {
    const config = await window.api.getConfig();
    serverExe = config.llamaServerExe || serverExe;
    const p = config.profiles[config.activeProfile];
    modelPath = p.modelPath || modelPath;
  } catch {}

  const cmd = [
    serverExe,
    '-m "' + modelPath + '"',
    "--ctx " + S.n_ctx,
    "--n-gpu-layers " + S.n_gpu_layers,
    "--threads " + S.threads,
    "--n-batch " + S.n_batch,
    S.flash_attn ? "--flash-attn" : "",
    S.no_context_shift ? "--no-context-shift" : "",
    S.cont_batching ? "--cont-batching" : "",
    S.mlock ? "--mlock" : "",
    "--cache-type-k " + S.cache_type_k,
    "--cache-type-v " + S.cache_type_v,
    S.chat_template === "jinja" ? "--chat-template-file chat_template.jinja" : "--chat-template " + S.chat_template,
    S.reasoning ? "--reasoning deepseek" : "",
    "--host " + (S.host || "0.0.0.0") + " --port " + (S.port || "8080"),
  ]
    .filter(Boolean)
    .join(" \\\n  ");

  navigator.clipboard.writeText(cmd).catch(() => {});
  const fb = document.getElementById("export-feedback");
  if (!fb) return;
  fb.textContent = "copied to clipboard";
  fb.style.color = "var(--gr)";
  setTimeout(() => {
    fb.textContent = "";
  }, 2500);
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
  const fb = document.getElementById("export-feedback");
  if (!fb) return;
  fb.textContent = "JSON copied to clipboard";
  fb.style.color = "var(--gr)";
  setTimeout(() => {
    fb.textContent = "";
  }, 2500);
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
