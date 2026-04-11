const os = require("os");
const path = require("path");

const QWEN_SAMPLERS = ["penalties", "dry", "top_k", "typ_p", "top_p", "min_p", "xtc", "temperature"];
const STOP_SEQUENCES = ["<|im_end|>", "<|endoftext|>"];

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function createServerDefaults() {
  return {
    host: "0.0.0.0",
    port: 8080,
    ctxSize: 81920,
    nGpuLayers: 99,
    threads: 4,
    nBatch: 4096,
    nUbatch: 2048,
    parallel: 1,
  };
}

function createPerformanceDefaults() {
  return {
    flashAttn: true,
    cacheTypeK: "q8_0",
    cacheTypeV: "q8_0",
    cudaGraphOpt: true,
    cudaForceCublasCompute16F: true,
  };
}

function createFlagsDefaults() {
  return {
    noContextShift: true,
    extraArgs: "",
    contBatching: true,
    mlock: true,
  };
}

function createChatDefaults(overrides = {}) {
  const maxTokens = Number.isFinite(overrides.maxTokens) ? overrides.maxTokens : 81920;
  const nPredict = Number.isFinite(overrides.nPredict) ? overrides.nPredict : maxTokens;

  return {
    maxTokens,
    temperature: 1.0,
    topP: 0.95,
    topK: 20,
    minP: 0.0,
    presencePenalty: 0.0,
    repetitionPenalty: 1.0,
    seed: -1,
    repeatLastN: 64,
    frequencyPenalty: 0,
    nPredict,
    samplers: [...QWEN_SAMPLERS],
    stop: [...STOP_SEQUENCES],
    systemPrompt: "",
    ...overrides,
    maxTokens,
    nPredict,
  };
}

function createProfile({
  name,
  alias,
  chatTemplateFile = "",
  mmprojFile = "",
  reasoningEnabled,
  chat = {},
}) {
  return {
    name,
    modelPath: "",
    alias,
    chatTemplateFile,
    mmprojFile,
    server: createServerDefaults(),
    performance: createPerformanceDefaults(),
    reasoning: { enabled: reasoningEnabled, format: "deepseek", budget: 8192 },
    chat: createChatDefaults(chat),
    flags: createFlagsDefaults(),
  };
}

const DEFAULT_CONFIG = {
  version: 2,
  llamaServerExe: process.platform === "win32" ? "llama-server.exe" : "llama-server",
  modelsDirectory: path.join(os.homedir(), "Models"),
  activeProfile: "HERETIC Thinking",
  profiles: {
    "HERETIC Thinking": createProfile({
      name: "HERETIC Thinking",
      alias: "Qwen3.5-9B-DavidAU-HERETIC",
      reasoningEnabled: true,
      chat: {
        temperature: 1.0,
        topP: 0.95,
        topK: 20,
        presencePenalty: 1.5,
      },
    }),
    "HERETIC Code": createProfile({
      name: "HERETIC Code",
      alias: "Qwen3.5-9B-DavidAU-HERETIC",
      reasoningEnabled: true,
      chat: {
        temperature: 0.6,
        topP: 0.95,
        topK: 20,
        presencePenalty: 0.0,
      },
    }),
    "HERETIC Fast": createProfile({
      name: "HERETIC Fast",
      alias: "Qwen3.5-9B-DavidAU-HERETIC",
      reasoningEnabled: false,
      chat: {
        maxTokens: 8192,
        temperature: 0.7,
        topP: 0.8,
        topK: 20,
        presencePenalty: 1.5,
      },
    }),
    "HERETIC Instruct": createProfile({
      name: "HERETIC Instruct",
      alias: "Qwen3.5-9B-DavidAU-HERETIC",
      reasoningEnabled: false,
      chat: {
        temperature: 1.0,
        topP: 1.0,
        topK: 40,
        presencePenalty: 2.0,
      },
    }),
    "HauhauCS Thinking": createProfile({
      name: "HauhauCS Thinking",
      alias: "Qwen3.5-9B-HauhauCS-Aggressive",
      reasoningEnabled: true,
      chat: {
        temperature: 0.6,
        topP: 0.95,
        topK: 20,
        presencePenalty: 0.0,
      },
    }),
    "HauhauCS Fast": createProfile({
      name: "HauhauCS Fast",
      alias: "Qwen3.5-9B-HauhauCS-Aggressive",
      reasoningEnabled: false,
      chat: {
        maxTokens: 8192,
        temperature: 0.7,
        topP: 0.8,
        topK: 20,
        presencePenalty: 1.5,
      },
    }),
    "Qwopus Agent": createProfile({
      name: "Qwopus Agent",
      alias: "Qwen3.5-9B-Qwopus-v3",
      reasoningEnabled: true,
      chat: {
        maxTokens: 4096,
        temperature: 0.3,
        topP: 0.9,
        topK: 40,
        repetitionPenalty: 1.05,
      },
    }),
    "Qwopus Chat": createProfile({
      name: "Qwopus Chat",
      alias: "Qwen3.5-9B-Qwopus-v3",
      reasoningEnabled: true,
      chat: {
        maxTokens: 32768,
        temperature: 0.5,
        topP: 0.9,
        topK: 40,
        presencePenalty: 0.5,
        repetitionPenalty: 1.05,
      },
    }),
  },
};

module.exports = {
  DEFAULT_CONFIG,
  cloneValue,
};
