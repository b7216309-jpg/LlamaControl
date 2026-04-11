let _CTX = 81920, _VMAX = 12, _RMAX = 64;
let MAX_TPS = 60, MAX_PTS = 600, MAX_NET = 15;
let coresBuilt = false;

const APP_SETTINGS_KEY = 'llama-control-app-settings';
const UI_THEMES = {
  gruvbox: 'Gruvbox',
  nord: 'Nord',
  forest: 'Forest',
  ember: 'Ember',
};
const AS = {
  alertCpu: 90,
  alertGpu: 95,
  alertGpuTemp: 85,
  alertVram: 90,
  alertRam: 85,
  pollInterval: 1500,
  maxLogLines: 14,
  autoStartServer: false,
  uiTheme: 'gruvbox',
};

function safeJsonParse(raw, fallback) {
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

function normalizeUiTheme(theme) {
  return Object.prototype.hasOwnProperty.call(UI_THEMES, theme) ? theme : 'gruvbox';
}

function applyUiTheme(theme) {
  const normalized = normalizeUiTheme(theme);
  document.documentElement.setAttribute('data-ui-theme', normalized);
  if (typeof refreshTerminalThemes === 'function') {
    try { refreshTerminalThemes(); } catch {}
  }
  return normalized;
}

Object.assign(AS, safeJsonParse(localStorage.getItem(APP_SETTINGS_KEY), {}));
AS.uiTheme = applyUiTheme(AS.uiTheme);

function saveAS() {
  localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(AS));
}

let _pollTimer = null, _logTimer = null;

let t0 = 0;
let ttftH = [], prevReq = 0, peakTps = 0, reqHist = safeJsonParse(localStorage.getItem('nerv-req-hist'), []);
if (!Array.isArray(reqHist)) reqHist = [];
let alertCount = 0, alertDebounce = {}, alertLog = [];
const peaks = { cpu: 0, gpuUtil: 0, gpuTemp: 0, gpuPow: 0, vram: 0, ram: 0, tps: 0 };
let lastTokenCount = 0, lastTokenTime = Date.now();
let _derivedReqTotal = Array.isArray(reqHist) ? reqHist.length : 0;
let _trackedExternalReq = null;
let _lastRawMetrics = null;
let _metricResetPending = false;
const _metricResetBaselines = {
  req_tot: null,
  req_fail: null,
  prompt_toks: null,
  gen_toks: null,
  prefill_s: null,
  eval_s: null,
};

const H = { cpu: [], gpu: [], tps: [], kv: [], mem: [] };
const HLEN = 28;
