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


