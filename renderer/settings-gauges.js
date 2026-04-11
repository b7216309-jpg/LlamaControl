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
  n_ubatch: 512,
  n_gpu_layers: 99,
  threads: 4,
  flash_attn: true,
  no_context_shift: true,
  cont_batching: false,
  mlock: false,
  no_mmap: false,
  cache_prompt: true,
  cache_type_k: "q8_0",
  cache_type_v: "q8_0",
  chat_template: "jinja",
  reasoning: true,
  extra_args: "",
  system_prompt: "",
  stop: [],
  samplers: ["top_k", "tfs", "typ_p", "top_p", "min_p", "temperature"],
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
