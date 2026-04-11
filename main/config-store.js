const fs = require("fs");
const path = require("path");

const { DEFAULT_CONFIG, cloneValue } = require("./default-config");

function mergeConfigValue(base, override) {
  if (override === undefined) return cloneValue(base);
  if (Array.isArray(base)) return Array.isArray(override) ? [...override] : cloneValue(base);
  if (base && typeof base === "object" && !Array.isArray(base)) {
    const overrideObj = override && typeof override === "object" && !Array.isArray(override) ? override : {};
    const result = {};
    const keys = new Set([...Object.keys(base), ...Object.keys(overrideObj)]);
    for (const key of keys) {
      result[key] = mergeConfigValue(base[key], overrideObj[key]);
    }
    return result;
  }
  if (override && typeof override === "object") return cloneValue(override);
  return override;
}

function normalizeConfig(raw) {
  const cfg = mergeConfigValue(DEFAULT_CONFIG, raw || {});
  if (!cfg.profiles || typeof cfg.profiles !== "object") {
    cfg.profiles = cloneValue(DEFAULT_CONFIG.profiles);
  }
  if (!cfg.profiles[cfg.activeProfile]) {
    cfg.activeProfile = Object.keys(cfg.profiles)[0] || DEFAULT_CONFIG.activeProfile;
  }

  for (const name of Object.keys(cfg.profiles)) {
    const profile = cfg.profiles[name];
    if (!profile || typeof profile !== "object") continue;

    profile.server = profile.server || {};
    if (profile.server.nUbatch === undefined) profile.server.nUbatch = 2048;
    if (profile.server.parallel === undefined) profile.server.parallel = 1;

    profile.flags = profile.flags || {};
    if (profile.flags.noMmap === undefined) profile.flags.noMmap = false;
    if (profile.flags.mlock === undefined) profile.flags.mlock = false;
    if (profile.flags.contBatching === undefined) profile.flags.contBatching = false;
    if (profile.flags.noContextShift === undefined) profile.flags.noContextShift = true;
    if (profile.flags.extraArgs === undefined) profile.flags.extraArgs = "";

    profile.reasoning = profile.reasoning || {};
    if (profile.reasoning.enabled === undefined) profile.reasoning.enabled = false;
    if (profile.reasoning.format === undefined) profile.reasoning.format = "deepseek";
    if (profile.reasoning.budget === undefined) profile.reasoning.budget = 8192;

    profile.chat = profile.chat || {};
    if (profile.chat.nPredict === undefined && Number.isFinite(Number(profile.chat.maxTokens))) {
      profile.chat.nPredict = Number(profile.chat.maxTokens);
    }
    if (profile.chat.maxTokens === undefined && Number.isFinite(Number(profile.chat.nPredict)) && Number(profile.chat.nPredict) > 0) {
      profile.chat.maxTokens = Number(profile.chat.nPredict);
    }
    if (profile.chat.cachePrompt === undefined) profile.chat.cachePrompt = true;

    profile.performance = profile.performance || {};
    if (profile.performance.cacheTypeK === undefined) profile.performance.cacheTypeK = "q8_0";
    if (profile.performance.cacheTypeV === undefined) profile.performance.cacheTypeV = "q8_0";
  }

  return cfg;
}

function findGgufFiles(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findGgufFiles(fullPath, out);
      continue;
    }
    if (entry.name.toLowerCase().endsWith(".gguf")) out.push(fullPath);
  }

  return out;
}

function autoResolveProfileModels(cfg) {
  const dir = cfg.modelsDirectory;
  if (!dir || !fs.existsSync(dir)) return false;

  const needsResolve = Object.values(cfg.profiles).some(
    (profile) => profile && (!profile.modelPath || profile.modelPath === "") && profile.alias
  );
  if (!needsResolve) return false;

  const allModels = findGgufFiles(dir);
  const mainModels = allModels.filter((file) => !/^mmproj/i.test(path.basename(file)));
  let changed = false;

  const hints = {
    HERETIC: /heretic/i,
    HauhauCS: /hauhaucs|hauhau/i,
    Qwopus: /qwopus/i,
  };

  for (const name of Object.keys(cfg.profiles)) {
    const profile = cfg.profiles[name];
    if (!profile || (profile.modelPath && profile.modelPath !== "")) continue;

    let matcher = null;
    for (const [key, pattern] of Object.entries(hints)) {
      if (name.includes(key) || (profile.alias || "").toLowerCase().includes(key.toLowerCase())) {
        matcher = pattern;
        break;
      }
    }
    if (!matcher) continue;

    const match = mainModels.find((file) => matcher.test(path.basename(file)));
    if (!match) continue;

    profile.modelPath = match;
    const parentDir = path.dirname(match);
    try {
      const siblings = fs.readdirSync(parentDir);
      const mmproj = siblings.find((file) => /^mmproj.*\.gguf$/i.test(file));
      if (mmproj && !profile.mmprojFile) {
        profile.mmprojFile = path.join(parentDir, mmproj);
      }
    } catch {}
    changed = true;
  }

  return changed;
}

function scanModelsDirectory(modelsDir) {
  const results = [];

  function scanDir(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
        continue;
      }
      if (!entry.name.endsWith(".gguf") || entry.name.toLowerCase().startsWith("mmproj")) continue;

      let stats;
      let parentFiles;
      const parentDir = path.dirname(fullPath);
      try {
        stats = fs.statSync(fullPath);
        parentFiles = fs.readdirSync(parentDir);
      } catch {
        continue;
      }

      const chatTemplate = parentFiles.find((file) => /^chat_template.*\.jinja$/i.test(file) && !/instruct/i.test(file));
      const chatTemplateInstruct = parentFiles.find((file) => /^chat_template.*instruct.*\.jinja$/i.test(file));
      const mmproj = parentFiles.find((file) => /^mmproj.*\.gguf$/i.test(file));

      results.push({
        path: fullPath,
        name: entry.name.replace(".gguf", ""),
        sizeBytes: stats.size,
        sizeDisplay: `${(stats.size / (1024 * 1024 * 1024)).toFixed(1)} GB`,
        chatTemplateFile: chatTemplate
          ? path.join(parentDir, chatTemplate)
          : (chatTemplateInstruct ? path.join(parentDir, chatTemplateInstruct) : null),
        chatTemplateInstructFile: chatTemplateInstruct ? path.join(parentDir, chatTemplateInstruct) : null,
        mmprojFile: mmproj ? path.join(parentDir, mmproj) : null,
        directory: parentDir,
      });
    }
  }

  if (modelsDir) scanDir(modelsDir);
  return results;
}

function createConfigStore() {
  let config = null;
  let configPath = null;

  function ensureConfigPath() {
    if (!configPath) throw new Error("Config path has not been initialized");
  }

  function persist(nextConfig) {
    ensureConfigPath();
    const normalized = normalizeConfig(nextConfig);
    fs.writeFileSync(configPath, JSON.stringify(normalized, null, 2), "utf-8");
    config = normalized;
    return config;
  }

  return {
    setConfigPath(nextPath) {
      configPath = nextPath;
    },
    load() {
      ensureConfigPath();
      try {
        if (fs.existsSync(configPath)) {
          const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
          const loaded = normalizeConfig(raw);
          if (autoResolveProfileModels(loaded)) {
            try {
              fs.writeFileSync(configPath, JSON.stringify(loaded, null, 2), "utf-8");
            } catch {}
          }
          config = loaded;
          return config;
        }
      } catch {}

      const initial = normalizeConfig(DEFAULT_CONFIG);
      autoResolveProfileModels(initial);
      return persist(initial);
    },
    save(nextConfig) {
      return persist(nextConfig);
    },
    getConfig() {
      return config;
    },
    getActiveProfile() {
      const current = config || DEFAULT_CONFIG;
      return current.profiles[current.activeProfile] || current.profiles.default || Object.values(current.profiles)[0];
    },
    getProfiles() {
      return { profiles: config.profiles, activeProfile: config.activeProfile };
    },
    saveProfile(name, profile) {
      config.profiles[name] = { ...profile, name };
      persist(config);
    },
    deleteProfile(name) {
      if (name === config.activeProfile) {
        return { ok: false, msg: "Cannot delete the active profile" };
      }
      delete config.profiles[name];
      persist(config);
      return { ok: true };
    },
    setActiveProfile(name) {
      if (!config.profiles[name]) {
        return { ok: false, msg: "Profile not found" };
      }
      config.activeProfile = name;
      persist(config);
      return { ok: true };
    },
    scanModels() {
      const current = config || DEFAULT_CONFIG;
      return scanModelsDirectory(current.modelsDirectory);
    },
  };
}

module.exports = {
  createConfigStore,
};
