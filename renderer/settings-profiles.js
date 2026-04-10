let _models = [];

async function loadProfiles() {
  try {
    const { profiles, activeProfile } = await window.api.getProfiles();
    const sel = document.getElementById("s-profile");
    clearNode(sel);
    for (const name of Object.keys(profiles)) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      if (name === activeProfile) opt.selected = true;
      sel.appendChild(opt);
    }
  } catch (e) { console.error("loadProfiles:", e); }
}

async function switchProfile(name) {
  try {
    await window.api.setActiveProfile(name);
    await initPorts();
    await initSettings();
    updateFlags();
    addLogEntry("INFO", "Switched to profile: " + name);
  } catch (e) {
    addLogEntry("ERR", "Profile switch failed: " + e.message);
  }
}

async function saveAsProfile() {
  const inp = document.getElementById("s-newprof");
  const name = (inp.value || "").trim();
  if (!name) return;
  try {
    const config = await window.api.getConfig();
    const current = config.profiles[config.activeProfile];
    await window.api.saveProfile(name, { ...current, name });
    await window.api.setActiveProfile(name);
    inp.value = "";
    await loadProfiles();
    addLogEntry("INFO", "Profile saved: " + name);
  } catch (e) {
    addLogEntry("ERR", "Save profile failed: " + e.message);
  }
}

async function deleteCurrentProfile() {
  const sel = document.getElementById("s-profile");
  const name = sel.value;
  try {
    const result = await window.api.deleteProfile(name);
    if (result.ok) {
      await loadProfiles();
      addLogEntry("INFO", "Profile deleted: " + name);
      return;
    }
    addLogEntry("WARN", result.msg || "Cannot delete profile");
  } catch (e) {
    addLogEntry("ERR", e.message);
  }
}

async function rescanModels() {
  try {
    _models = await window.api.scanModels();
    const sel = document.getElementById("s-model");
    clearNode(sel);
    _models.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m.path;
      opt.textContent = m.name + " (" + m.sizeDisplay + ")";
      sel.appendChild(opt);
    });

    const config = await window.api.getConfig();
    const p = config.profiles[config.activeProfile];
    if (p && p.modelPath) sel.value = p.modelPath;
    document.getElementById("s-model-info").textContent = _models.length + " models found";
  } catch (e) {
    addLogEntry("ERR", "Scan failed: " + e.message);
  }
}

async function selectModel(modelPath) {
  try {
    const model = _models.find((m) => m.path === modelPath);
    if (!model) return;
    const config = await window.api.getConfig();
    const p = config.profiles[config.activeProfile];
    p.modelPath = model.path;
    p.alias = model.name;

    if (!p.reasoning.enabled && model.chatTemplateInstructFile) {
      p.chatTemplateFile = model.chatTemplateInstructFile;
    } else if (model.chatTemplateFile) {
      p.chatTemplateFile = model.chatTemplateFile;
    } else {
      p.chatTemplateFile = "";
    }

    p.mmprojFile = model.mmprojFile || "";
    await window.api.saveConfig(config);

    const tmplLabel = p.chatTemplateFile
      ? p.chatTemplateFile.includes("instruct")
        ? " + jinja-instruct"
        : " + jinja"
      : "";
    const info = document.getElementById("s-model-info");
    if (info) info.textContent = model.name + tmplLabel + (model.mmprojFile ? " + vision" : "");
    addLogEntry("INFO", "Model selected: " + model.name);
  } catch (e) {
    addLogEntry("ERR", e.message);
  }
}

async function loadPaths() {
  try {
    const config = await window.api.getConfig();
    document.getElementById("s-serverexe").value = config.llamaServerExe || "";
    document.getElementById("s-modelsdir").value = config.modelsDirectory || "";
    const p = config.profiles[config.activeProfile];
    document.getElementById("s-cudagraph").checked = p?.performance?.cudaGraphOpt || false;
    document.getElementById("s-cudafp16").checked = p?.performance?.cudaForceCublasCompute16F || false;
  } catch (e) { console.error("loadPaths:", e); }
}

async function savePaths() {
  try {
    const config = await window.api.getConfig();
    config.llamaServerExe = document.getElementById("s-serverexe").value;
    config.modelsDirectory = document.getElementById("s-modelsdir").value;
    const p = config.profiles[config.activeProfile];
    p.performance.cudaGraphOpt = document.getElementById("s-cudagraph").checked;
    p.performance.cudaForceCublasCompute16F = document.getElementById("s-cudafp16").checked;
    await window.api.saveConfig(config);
  } catch (e) { console.error("savePaths:", e); }
}

async function applyAndRestart() {
  await saveSettingsToConfig();
  await savePaths();
  const fb = document.getElementById("apply-feedback");
  if (fb) {
    fb.textContent = "restarting server...";
    fb.style.color = "var(--am)";
  }
  await llmAction("reboot");
  if (!fb) return;
  fb.textContent = "server restarted";
  fb.style.color = "var(--gr)";
  setTimeout(() => {
    fb.textContent = "";
  }, 3000);
}

async function updateFlags() {
  const box = document.querySelector("#box-flg .box-body");
  if (!box) return;
  let host = "0.0.0.0", port = 8080, parallel = 1, alias = "", tmplFile = "", mmproj = "";
  try {
    const cfg = await window.api.getConfig();
    const p = cfg.profiles[cfg.activeProfile];
    if (p) {
      host = p.server?.host ?? host;
      port = p.server?.port ?? port;
      parallel = p.server?.parallel ?? parallel;
      alias = p.alias || "";
      tmplFile = p.chatTemplateFile || "";
      mmproj = p.mmprojFile || "";
    }
  } catch (e) { console.error("updateFlags getConfig:", e); }
  const badges = [];
  badges.push({ t: "--host " + host, c: "b-am" });
  badges.push({ t: "--port " + port, c: "b-am" });
  badges.push({ t: "--ctx-size " + S.n_ctx, c: "b-cy" });
  badges.push({ t: "--n-gpu-layers " + S.n_gpu_layers, c: "b-or" });
  badges.push({ t: "--threads " + S.threads, c: "b-am" });
  badges.push({ t: "--batch-size " + S.n_batch, c: "b-dm" });
  badges.push({ t: "--ubatch-size " + (S.n_ubatch || S.n_batch), c: "b-dm" });
  badges.push({ t: "--parallel " + parallel, c: "b-dm" });
  if (alias) badges.push({ t: "--alias " + alias, c: "b-fg3" });
  badges.push({ t: "--cache-type-k " + S.cache_type_k, c: "b-cy" });
  badges.push({ t: "--cache-type-v " + S.cache_type_v, c: "b-cy" });
  if (S.flash_attn) badges.push({ t: "--flash-attn on", c: "b-gr" });
  if (S.no_context_shift) badges.push({ t: "--no-context-shift", c: "b-rd" });
  if (S.cont_batching) badges.push({ t: "--cont-batching", c: "b-gr" });
  if (S.mlock) badges.push({ t: "--mlock", c: "b-gr" });
  if (S.no_mmap) badges.push({ t: "--no-mmap", c: "b-rd" });
  if (S.reasoning) badges.push({ t: "--reasoning-format deepseek", c: "b-vi" });
  if (tmplFile) badges.push({ t: "--chat-template-file " + tmplFile, c: "b-fg3" });
  if (mmproj) badges.push({ t: "--mmproj " + mmproj, c: "b-fg3" });
  if (S.extra_args && S.extra_args.trim()) badges.push({ t: S.extra_args.trim(), c: "b-fg3" });
  clearNode(box);
  badges.forEach((b) => {
    const badge = createSpan("badge " + b.c, b.t);
    box.appendChild(badge);
  });
}
