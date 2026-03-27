let _miniOpen = false;
let _savedBounds = null;

async function toggleMini() {
  const hud = document.getElementById("mini-hud");
  const topbar = document.getElementById("topbar");
  const main = document.getElementById("main");
  const statusbar = document.getElementById("statusbar");

  _miniOpen = !_miniOpen;

  if (_miniOpen) {
    try {
      _savedBounds = await window.api.getBounds();
    } catch {}

    topbar.style.display = "none";
    main.style.display = "none";
    statusbar.style.display = "none";
    hud.style.display = "flex";
    hud.style.position = "static";
    hud.style.border = "none";
    hud.style.minWidth = "0";
    hud.style.webkitAppRegion = "drag";
    hud.querySelectorAll("button,input,select").forEach((el) => {
      el.style.webkitAppRegion = "no-drag";
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    const wx = (_savedBounds?.x || 100) + (_savedBounds?.width || 1400) - 320;
    const h = hud.scrollHeight + 2;
    try {
      await window.api.setBounds({ width: 320, height: h, x: wx, y: _savedBounds?.y || 100 });
    } catch {}
    try {
      await window.api.setOnTop(true);
    } catch {}
    return;
  }

  hud.style.display = "none";
  hud.style.position = "fixed";
  hud.style.border = "1px solid var(--bdr)";
  hud.style.minWidth = "260px";
  hud.style.webkitAppRegion = "";
  topbar.style.display = "flex";
  main.style.display = "flex";
  statusbar.style.display = "flex";
  try {
    await window.api.setOnTop(false);
  } catch {}
  if (_savedBounds) {
    try {
      await window.api.setBounds(_savedBounds);
    } catch {}
  }
}

(() => {
  const hud = document.getElementById("mini-hud");
  const bar = document.getElementById("mini-drag-bar");
  if (!hud || !bar) return;

  let drag = false;
  let ox = 0;
  let oy = 0;
  let sx = 0;
  let sy = 0;

  bar.addEventListener("mousedown", (e) => {
    if (e.target.tagName === "BUTTON") return;
    drag = true;
    const r = hud.getBoundingClientRect();
    ox = r.left;
    oy = r.top;
    sx = e.clientX;
    sy = e.clientY;
    document.body.style.cursor = "move";
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!drag) return;
    hud.style.left = ox + e.clientX - sx + "px";
    hud.style.top = oy + e.clientY - sy + "px";
    hud.style.bottom = "auto";
    hud.style.right = "auto";
  });

  document.addEventListener("mouseup", () => {
    if (!drag) return;
    drag = false;
    document.body.style.cursor = "";
  });
})();

function updateMini(sys, m, sl) {
  if (!_miniOpen) return;

  const mSet = (barId, valId, pct, val, col) => {
    const b = document.getElementById(barId);
    const v = document.getElementById(valId);
    if (b) {
      b.style.width = Math.min(100, pct) + "%";
      b.style.background = col || ramp(pct);
    }
    if (v) {
      v.textContent = val;
      v.style.color = col || ramp(pct);
    }
  };

  const avg = sys.cpu.cores.reduce((a, b) => a + b.pct, 0) / sys.cpu.cores.length;
  const vp = sys.gpu && sys.gpu.vramUsed !== undefined ? (sys.gpu.vramUsed / _VMAX) * 100 : 0;
  const mp = (sys.mem.used / sys.mem.total) * 100;
  mSet("m-cpu-bar", "m-cpu-v", avg, avg.toFixed(0) + "%");
  mSet(
    "m-gpu-bar",
    "m-gpu-v",
    sys.gpu && sys.gpu.util !== undefined ? sys.gpu.util : 0,
    sys.gpu && sys.gpu.util !== undefined ? sys.gpu.util.toFixed(0) + "%" : "--%"
  );
  mSet(
    "m-vram-bar",
    "m-vram-v",
    vp,
    sys.gpu && sys.gpu.vramUsed !== undefined ? sys.gpu.vramUsed.toFixed(1) + "G" : "--"
  );
  mSet("m-ram-bar", "m-ram-v", mp, sys.mem.used.toFixed(1) + "G");

  if (sys.gpu && sys.gpu.temp !== undefined) {
    setT("m-gtemp", sys.gpu.temp + " C");
    setT("m-gpow", sys.gpu.power + "W");
  }

  if (m) {
    mSet("m-tps-bar", "m-tps-v", (m._tps / MAX_TPS) * 100, m._tps.toFixed(1) + " t/s", "var(--or)");
    setT("m-ptoks", fmtTok(m.prompt_toks));
    setT("m-gtoks", fmtTok(m.gen_toks));
    setT("m-peak", peakTps > 0 ? peakTps.toFixed(1) : "--");
    const ms = document.getElementById("mini-status");
    if (ms) {
      ms.textContent = m._run ? "* GEN" : "* ON";
      ms.style.color = m._run ? "var(--or)" : "var(--gr)";
    }
  } else {
    const ms = document.getElementById("mini-status");
    if (ms) {
      ms.textContent = "* OFF";
      ms.style.color = "var(--rd)";
    }
  }

  const mm = document.getElementById("mini-model");
  if (mm && !mm._set) {
    const tb = document.getElementById("tb-model");
    if (tb && tb.textContent !== "LlamaControl") {
      mm.textContent = tb.textContent;
      mm._set = true;
    }
  }
}

let _settingsOpen = true;
let _settingsWidth = 280;

function toggleSettings() {
  const col = document.getElementById("settings-col");
  const inner = document.getElementById("settings-inner");
  const arrow = document.getElementById("settings-arrow");
  const toggle = document.getElementById("settings-toggle");
  const label = document.getElementById("settings-label");
  const handle = document.getElementById("drag-settings");

  if (_settingsOpen) {
    _settingsWidth = col.offsetWidth || 280;
    col.style.width = "22px";
    col.style.minWidth = "22px";
    col.style.overflow = "hidden";
    inner.style.display = "none";
    handle.style.display = "none";
    toggle.style.writingMode = "vertical-rl";
    toggle.style.height = "100%";
    toggle.style.justifyContent = "flex-start";
    toggle.style.padding = "10px 4px";
    toggle.style.gap = "6px";
    toggle.style.position = "relative";
    toggle.style.borderBottom = "none";
    toggle.style.borderRight = "1px solid var(--bdr)";
    label.style.letterSpacing = "3px";
    arrow.textContent = ">";
    arrow.style.transform = "rotate(180deg)";
    _settingsOpen = false;
    return;
  }

  col.style.width = _settingsWidth + "px";
  col.style.minWidth = "";
  col.style.overflowY = "auto";
  col.style.overflowX = "hidden";
  inner.style.display = "";
  handle.style.display = "";
  toggle.style.writingMode = "";
  toggle.style.height = "18px";
  toggle.style.justifyContent = "space-between";
  toggle.style.padding = "3px 8px";
  toggle.style.gap = "";
  toggle.style.position = "sticky";
  toggle.style.borderBottom = "1px solid var(--bdr)";
  toggle.style.borderRight = "none";
  label.style.letterSpacing = "2px";
  arrow.textContent = ">";
  arrow.style.transform = "";
  _settingsOpen = true;
}
