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
    fitTarget: 0,
    cacheRam: -1,
    threadsBatch: 0,
    threadsHttp: 0,
    poll: 0,
    prio: 0,
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
  serverVariant = "standard",
  chat = {},
  server = {},
  performance = {},
  flags = {},
}) {
  return {
    name,
    modelPath: "",
    alias,
    chatTemplateFile,
    mmprojFile,
    serverVariant,
    server: { ...createServerDefaults(), ...server },
    performance: { ...createPerformanceDefaults(), ...performance },
    reasoning: { enabled: reasoningEnabled, format: "deepseek", budget: 8192 },
    chat: createChatDefaults(chat),
    flags: { ...createFlagsDefaults(), ...flags },
  };
}

const DEFAULT_CONFIG = {
  version: 2,
  llamaServerExe: process.platform === "win32" ? "llama-server.exe" : "llama-server",
  llamaServerTurboExe: process.platform === "win32" ? "llama-server-turbo.exe" : "llama-server-turbo",
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
    "TURBOQUANT HauhauCS Fast": createProfile({
      name: "TURBOQUANT HauhauCS Fast",
      alias: "Qwen3.5-9B-HauhauCS-Aggressive",
      reasoningEnabled: true,
      serverVariant: "turboquant",
      server: { ctxSize: 32768, threads: 4 },
      performance: {
        cacheTypeK: "turbo4",
        cacheTypeV: "turbo4",
        fitTarget: 768,
        threadsBatch: 4,
        threadsHttp: 2,
        poll: 0,
        prio: -1,
      },
      chat: {
        maxTokens: 32768,
        temperature: 0.6,
        topP: 0.95,
        topK: 20,
      },
    }),
    "TURBOQUANT HauhauCS Smooth": createProfile({
      name: "TURBOQUANT HauhauCS Smooth",
      alias: "Qwen3.5-9B-HauhauCS-Aggressive",
      reasoningEnabled: true,
      serverVariant: "turboquant",
      server: { ctxSize: 250000, threads: 6 },
      performance: {
        cacheTypeK: "turbo3",
        cacheTypeV: "turbo3",
        fitTarget: 768,
        cacheRam: 0,
        threadsBatch: 6,
        threadsHttp: 2,
        poll: 0,
        prio: -1,
      },
      flags: { noMmap: true },
      chat: {
        maxTokens: 250000,
        temperature: 0.6,
        topP: 0.95,
        topK: 20,
        minP: 0.0,
      },
    }),
    "TURBOQUANT Qwopus Fast": createProfile({
      name: "TURBOQUANT Qwopus Fast",
      alias: "Qwopus3.5-9B-v3-abliterated",
      reasoningEnabled: true,
      serverVariant: "turboquant",
      server: { ctxSize: 32768, threads: 4 },
      performance: {
        cacheTypeK: "turbo3",
        cacheTypeV: "turbo3",
        fitTarget: 768,
        threadsBatch: 4,
        threadsHttp: 2,
        poll: 0,
        prio: -1,
      },
      chat: {
        maxTokens: 32768,
        temperature: 0.7,
        topP: 0.9,
        topK: 20,
      },
    }),
    "TURBOQUANT Qwopus Smooth": createProfile({
      name: "TURBOQUANT Qwopus Smooth",
      alias: "Qwopus3.5-9B-v3-abliterated",
      reasoningEnabled: true,
      serverVariant: "turboquant",
      server: { ctxSize: 250000, threads: 6 },
      performance: {
        cacheTypeK: "turbo3",
        cacheTypeV: "turbo3",
        fitTarget: 768,
        cacheRam: 0,
        threadsBatch: 6,
        threadsHttp: 2,
        poll: 0,
        prio: -1,
      },
      flags: { noMmap: true },
      chat: {
        maxTokens: 250000,
        temperature: 0.55,
        topP: 0.9,
        topK: 20,
      },
    }),
  },
};

module.exports = {
  DEFAULT_CONFIG,
  cloneValue,
};
