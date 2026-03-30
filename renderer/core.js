let _CTX=81920,_VMAX=12,_RMAX=64;
let MAX_TPS=60,MAX_PTS=600,MAX_NET=15;
let coresBuilt = false;

// â”€â”€ APP SETTINGS (persisted in localStorage) â”€â”€
const APP_SETTINGS_KEY = 'llama-control-app-settings';
const AS = {
  alertCpu: 90, alertGpu: 95, alertGpuTemp: 85, alertVram: 90, alertRam: 85,
  pollInterval: 1500, maxLogLines: 14, autoStartServer: false,
};
function safeJsonParse(raw, fallback) {
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}
Object.assign(AS, safeJsonParse(localStorage.getItem(APP_SETTINGS_KEY), {}));
function saveAS() { localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(AS)); }
let _pollTimer = null, _logTimer = null;

let t0=0; // LLM server uptime origin (set when server detected running)
let ttftH=[],prevReq=0,peakTps=0,reqHist=safeJsonParse(localStorage.getItem('nerv-req-hist'), []);
if (!Array.isArray(reqHist)) reqHist = [];
let alertCount=0,alertDebounce={},alertLog=[];
const peaks={cpu:0,gpuUtil:0,gpuTemp:0,gpuPow:0,vram:0,ram:0,tps:0};
let slotStartTime=null,lastTokenCount=0,lastTokenTime=Date.now();
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

// â”€â”€ HISTORY ARRAYS for sparklines â”€â”€
const H={cpu:[],gpu:[],tps:[],kv:[],mem:[]};
const HLEN=28;
function pushH(key,val){H[key].push(val);if(H[key].length>HLEN)H[key].shift();}

// â”€â”€ COLOR RAMP: 0â†’60 green, 60â†’85 amber, 85â†’100 red â”€â”€
function ramp(p){
  p=Math.max(0,Math.min(100,p));
  if(p<=60){const t=p/60;return`rgb(${Math.round(184+(250-184)*t)},${Math.round(187+(189-187)*t)},${Math.round(38+(47-38)*t)})`;}
  if(p<=85){const t=(p-60)/25;return`rgb(${Math.round(250+(251-250)*t)},${Math.round(189+(73-189)*t)},${Math.round(47+(52-47)*t)})`;}
  const t=Math.min(1,(p-85)/15);return`rgb(251,${Math.round(73*(1-t*.5))},${Math.round(52*(1-t*.4))})`;
}

// â”€â”€ SPARKLINE: array â†’ ASCII block chars â”€â”€
function spark(arr,max){
  if(!arr.length)return'';
  const mx=max||Math.max(1,...arr);
  return arr.map(v=>' .:-=+*#'[Math.min(7,Math.floor(v/mx*8))]).join('');
}

// â”€â”€ Helpers â”€â”€
function setG(id,pct,col){
  const e=document.getElementById(id);if(!e)return;
  e.style.width=Math.min(100,Math.max(0,pct))+'%';
  e.style.background=col||ramp(pct);
}
function clearNode(el){ while(el && el.firstChild) el.removeChild(el.firstChild); }
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function appendCell(row, text, style) {
  const cell = document.createElement('td');
  if (style) cell.style.cssText = style;
  cell.textContent = text;
  row.appendChild(cell);
  return cell;
}
function createSpan(className, text) {
  const span = document.createElement('span');
  if (className) span.className = className;
  span.textContent = text;
  return span;
}
function createDiv(text, style, className) {
  const div = document.createElement('div');
  if (className) div.className = className;
  if (style) div.style.cssText = style;
  if (text !== undefined) div.textContent = text;
  return div;
}
function appendLogLine(container, ts, lvl, msg) {
  const line = document.createElement('div');
  line.className = 'log-line';
  line.appendChild(createSpan('log-ts', ts));
  line.appendChild(createSpan('log-lvl lvl-' + lvl, '[' + lvl + ']'));
  line.appendChild(createSpan('log-msg new', msg));
  container.appendChild(line);
  setTimeout(() => {
    const m = line.querySelector('.log-msg');
    if (m) m.classList.remove('new');
  }, 900);
  return line;
}
function setT(id,val){const e=document.getElementById(id);if(e)e.textContent=val;}
function setC(id,col){const e=document.getElementById(id);if(e)e.style.color=col;}
function setSpark(id,arr,max){const e=document.getElementById(id);if(e){e.textContent=spark(arr,max);e.style.color=ramp(arr.length ? arr[arr.length-1]/max*100 : 0);}}
function fmtTok(n){if(!n||n<=0)return'--';if(n>=1e6)return(n/1e6).toFixed(1)+'M';if(n>=1e3)return(n/1e3).toFixed(1)+'K';return String(Math.round(n));}
function getHistoryTokenTotals() {
  if (!Array.isArray(reqHist) || reqHist.length === 0) return { thk: 0, out: 0 };
  return reqHist.reduce((acc, entry) => {
    const thk = Number(entry?.thk);
    const out = Number(entry?.out);
    acc.thk += Number.isFinite(thk) ? thk : 0;
    acc.out += Number.isFinite(out) ? out : 0;
    return acc;
  }, { thk: 0, out: 0 });
}
function previewPrompt(text, maxLen = 40) {
  const compact = String(text || '').replace(/\s+/g, ' ').trim();
  if (!compact) return '[external request]';
  return compact.length > maxLen ? compact.slice(0, maxLen) : compact;
}
function pushHistoryEntry(entry) {
  reqHist.unshift(entry);
  if (reqHist.length > 20) reqHist.pop();
  localStorage.setItem('nerv-req-hist', JSON.stringify(reqHist));
  _derivedReqTotal = Math.max(_derivedReqTotal + 1, reqHist.length);
  _renderHistory();
}
function setMetricResetBaselines(source) {
  for (const key of Object.keys(_metricResetBaselines)) {
    const value = Number(source?.[key]);
    _metricResetBaselines[key] = Number.isFinite(value) ? value : 0;
  }
  _metricResetPending = false;
}
function adjustMetricCounter(key, value) {
  const current = Number(value);
  if (!Number.isFinite(current)) return 0;
  const baseline = _metricResetBaselines[key];
  if (!Number.isFinite(baseline)) return current;
  if (current < baseline) {
    _metricResetBaselines[key] = current;
    return 0;
  }
  return Math.max(0, current - baseline);
}
function applyMetricResetBaselines(metrics) {
  if (!metrics) return null;
  if (_metricResetPending) setMetricResetBaselines(metrics);
  return {
    ...metrics,
    req_tot: adjustMetricCounter('req_tot', metrics.req_tot),
    req_fail: adjustMetricCounter('req_fail', metrics.req_fail),
    prompt_toks: adjustMetricCounter('prompt_toks', metrics.prompt_toks),
    gen_toks: adjustMetricCounter('gen_toks', metrics.gen_toks),
    prefill_s: adjustMetricCounter('prefill_s', metrics.prefill_s),
    eval_s: adjustMetricCounter('eval_s', metrics.eval_s),
  };
}
function getSlotPromptTokens(sl) {
  if (!sl) return 0;
  if (sl.tokens_evaluated > 0) return sl.tokens_evaluated;
  return Math.max(0, (sl.n_past || 0) - (sl.tokens_predicted || 0));
}
function getSlotThinkTokens(sl) {
  return Math.max(0, Number(sl?.think_tokens) || 0);
}
function getSlotOutputTokens(sl) {
  return Math.max(0, (Number(sl?.tokens_predicted) || 0) - getSlotThinkTokens(sl));
}
function getSlotUsedTokens(sl) {
  const promptTokens = getSlotPromptTokens(sl);
  const predicted = Math.max(0, Number(sl?.tokens_predicted) || 0);
  return Math.max(Number(sl?.n_past) || 0, promptTokens + predicted);
}
function getRateFromTiming(count, ms) {
  const n = Number(count) || 0;
  const durMs = Number(ms) || 0;
  if (n <= 0 || durMs <= 0) return 0;
  return n / (durMs / 1000);
}
function getSlotTotalMs(sl) {
  return (Number(sl?.timing_prompt_ms) || 0) + (Number(sl?.timing_think_ms) || 0) + (Number(sl?.timing_predicted_ms) || 0);
}
function updateContextCapacity(nCtx) {
  const parsed = Number(nCtx);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed === _CTX) return;
  _CTX = parsed;
  const ctxLabel = document.getElementById('ctx-cap-label');
  if (ctxLabel) ctxLabel.textContent = 'Context - ' + _CTX.toLocaleString();
}
function recordExternalHistoryIfNeeded(sl) {
  const isRunning = sl.state === 1;
  if (isRunning) {
    _trackedExternalReq = {
      prompt: sl.prompt || _trackedExternalReq?.prompt || '',
      think: Math.max(_trackedExternalReq?.think || 0, getSlotThinkTokens(sl)),
      out: Math.max(_trackedExternalReq?.out || 0, getSlotOutputTokens(sl)),
      promptTokens: Math.max(_trackedExternalReq?.promptTokens || 0, getSlotPromptTokens(sl)),
      ttftMs: Math.max(_trackedExternalReq?.ttftMs || 0, Number(sl.timing_prompt_ms) || 0),
      totalMs: Math.max(_trackedExternalReq?.totalMs || 0, getSlotTotalMs(sl)),
      tps: Math.max(_trackedExternalReq?.tps || 0, getRateFromTiming(sl.tokens_predicted, sl.timing_predicted_ms)),
    };
    return;
  }
  if (!_trackedExternalReq) return;
  const recentlyHandledByChat =
    (typeof _activeInternalChat !== 'undefined' && _activeInternalChat) ||
    (typeof _lastHistoryWriteAt !== 'undefined' && (Date.now() - _lastHistoryWriteAt) < 2500);
  const hasUsefulData =
    (_trackedExternalReq.prompt && _trackedExternalReq.prompt.trim()) ||
    _trackedExternalReq.out > 0 ||
    _trackedExternalReq.promptTokens > 0;
  if (!recentlyHandledByChat && hasUsefulData) {
    pushHistoryEntry({
      now: new Date().toTimeString().slice(0, 8),
      prompt: previewPrompt(_trackedExternalReq.prompt),
      thk: _trackedExternalReq.think || 0,
      out: _trackedExternalReq.out || 0,
      tpsVal: _trackedExternalReq.tps > 0 ? _trackedExternalReq.tps.toFixed(1) : '--',
      ttftVal: _trackedExternalReq.ttftMs > 0 ? _trackedExternalReq.ttftMs.toFixed(0) + 'ms' : '--',
      totVal: _trackedExternalReq.totalMs > 0 ? (_trackedExternalReq.totalMs / 1000).toFixed(1) + 's' : '--',
      source: 'external',
    });
  }
  _trackedExternalReq = null;
}

// â”€â”€ ALERT SYSTEM â”€â”€
function alert_(boxId,msg,level='warn',key){
  const k=key||boxId+msg;
  const now=Date.now();
  if(alertDebounce[k]&&now-alertDebounce[k]<25000)return;
  alertDebounce[k]=now;
  const box=document.getElementById(boxId);
  if(box){box.classList.remove('a-warn','a-crit');void box.offsetWidth;box.classList.add(level==='crit'?'a-crit':'a-warn');}
  addLogEntry(level==='crit'?'ERR':'WARN',msg);
  alertCount++;
  alertLog.unshift({ts:new Date().toTimeString().slice(0,8),msg,level});
  if(alertLog.length>30)alertLog.pop();
  const badge=document.getElementById('alert-badge');
  if(badge){badge.textContent=alertCount;badge.className='alert-badge'+(alertCount===0?' zero':'');}
}

function checkAlerts(sys,m,sl){
  const avg=sys.cpu.cores.reduce((a,b)=>a+b.pct,0)/sys.cpu.cores.length;
  if(avg>AS.alertCpu)alert_('box-cpu','CPU avg >'+AS.alertCpu+'% ('+avg.toFixed(0)+'%)','warn','cpu-high');
  if(sys.gpu && sys.gpu.util!==undefined && sys.gpu.util>AS.alertGpu)alert_('box-gpu','GPU util >'+AS.alertGpu+'%','crit','gpu-crit');
  if(sys.gpu && sys.gpu.temp!==undefined && sys.gpu.temp>AS.alertGpuTemp)alert_('box-gpu','GPU temp >'+AS.alertGpuTemp+' C: '+sys.gpu.temp+' C','crit','gpu-temp');
  if(sys.gpu && sys.gpu.vramUsed!==undefined) {
    const vp=sys.gpu.vramUsed/_VMAX*100;
    if(vp>AS.alertVram)alert_('box-gpu','VRAM >'+AS.alertVram+'% ('+vp.toFixed(0)+'%)','warn','vram-high');
  }
  const mp=sys.mem.used/sys.mem.total*100;
  if(mp>AS.alertRam)alert_('box-mem','RAM >'+AS.alertRam+'% ('+mp.toFixed(0)+'%)','warn','mem-high');
  const kvp=m.kv_ratio*100;
  if(kvp>90)alert_('box-kvc','KV cache >90% - context near limit','crit','kv-crit');
  else if(kvp>80)alert_('box-kvc','KV cache >80% ('+kvp.toFixed(0)+'%)','warn','kv-warn');
  // Stall detection
  if(sl.state===1){
    const now=Date.now();
    if(sl.tokens_predicted!==lastTokenCount){lastTokenCount=sl.tokens_predicted;lastTokenTime=now;}
    const stall=(now-lastTokenTime)/1000;
    if(stall>180)alert_('box-slt','Slot 0 stalled: no new tokens for '+stall.toFixed(0)+'s','crit','stall');
  }else{lastTokenTime=Date.now();lastTokenCount=0;}
}

// â”€â”€ CORES â”€â”€
function buildCores(n){
  const c = document.getElementById('cores-wrap');
  clearNode(c);
  for (let i = 0; i < n; i++) {
    const row = document.createElement('div');
    row.className = 'g-row';
    row.appendChild(createSpan('g-lbl', String(i)));
    const track = document.createElement('div');
    track.className = 'g-track';
    const fill = document.createElement('div');
    fill.className = 'g-fill';
    fill.id = 'cr' + i;
    fill.style.width = '0%';
    track.appendChild(fill);
    row.appendChild(track);
    const value = createSpan('g-val', '0%');
    value.id = 'cv' + i;
    row.appendChild(value);
    c.appendChild(row);
  }
}

// â”€â”€ DISKS â”€â”€
function buildDisks(disks){
  if (!disks || !disks.length) return;
  const b = document.getElementById('disk-body');
  clearNode(b);
  disks.forEach(d => {
    const name = d.name.length > 10 ? d.name.slice(0,10) : d.name;
    const row = document.createElement('div');
    row.className = 'g-row';
    const label = document.createElement('span');
    label.className = 'g-lbl';
    label.style.cssText = 'font-size:9px;color:var(--am)';
    label.textContent = name;
    const track = document.createElement('div');
    track.className = 'g-track';
    const fill = document.createElement('div');
    fill.className = 'g-fill';
    fill.style.width = d.pct + '%';
    fill.style.background = ramp(d.pct);
    track.appendChild(fill);
    const value = document.createElement('span');
    value.className = 'g-val';
    value.style.color = 'var(--fg2)';
    value.textContent = d.used + '/' + d.total + 'G';
    row.appendChild(label);
    row.appendChild(track);
    row.appendChild(value);
    b.appendChild(row);
  });
}

// â”€â”€ PROCS â”€â”€
let _procs = [];
function renderProcs(procs) {
  if (!procs || !procs.length) return;
  _procs = procs;
  const tb = document.getElementById('proc-tb');
  clearNode(tb);
  procs.forEach(p => {
    const cpuValue = p.cpu ?? p.c ?? 0;
    const cpuParsed = typeof cpuValue === 'number' ? cpuValue : parseFloat(cpuValue);
    const cpu = Number.isFinite(cpuParsed) ? cpuParsed : 0;
    const name = p.name || p.n || '';
    const user = p.user || p.u || '';
    const mem = p.mem || p.m || '';
    const tr = document.createElement('tr');
    appendCell(tr, String(p.pid), 'color:var(--fg3)');
    appendCell(tr, name, 'color:var(--am)');
    appendCell(tr, user, 'color:var(--fg2)');
    appendCell(tr, cpu.toFixed(1), 'text-align:right;color:' + ramp(cpu*2));
    appendCell(tr, mem, 'text-align:right;color:var(--bl)');
    tr.addEventListener('contextmenu', e => {
      e.preventDefault();
      e.stopPropagation();
      showProcMenu(e.clientX, e.clientY, p.pid, name);
    });
    tb.appendChild(tr);
  });
  setT('proc-cnt', procs.length + '');
}

// â”€â”€ PROCESS CONTEXT MENU â”€â”€
function showProcMenu(x, y, pid, name) {
  let menu = document.getElementById('proc-ctx-menu');
  if (!menu) {
    menu = document.createElement('div');
    menu.id = 'proc-ctx-menu';
    menu.style.cssText = 'position:fixed;z-index:9999;background:var(--bg1);border:1px solid var(--bdr);padding:2px 0;font-family:var(--f);font-size:10px;display:none;min-width:120px;';
    document.body.appendChild(menu);
    document.addEventListener('click', () => menu.style.display='none');
    document.addEventListener('contextmenu', () => menu.style.display='none');
  }
  clearNode(menu);
  menu.appendChild(createDiv('PID ' + pid + ' · ' + name, 'padding:3px 10px;color:var(--fg3);font-size:9px;user-select:none;'));
  menu.appendChild(createDiv(undefined, 'border-top:1px solid var(--bdr);margin:2px 0;'));
  const killBtn = createDiv('Kill process', 'padding:3px 10px;color:var(--rd);cursor:pointer;user-select:none;');
  killBtn.id = 'proc-kill-btn';
  menu.appendChild(killBtn);
  menu.style.left = x+'px';
  menu.style.top = y+'px';
  menu.style.display = 'block';
  killBtn.onclick = async (e) => {
    e.stopPropagation();
    menu.style.display = 'none';
    const r = await window.api.killProcess(pid);
  addLogEntry(r.ok?'INFO':'ERR', (r.ok?'Killed':'Failed to kill')+' PID '+pid+' ('+name+')');
  };
}

// â”€â”€ IPC FETCHERS â”€â”€
async function fetchSys() {
  try { return await window.api.getSystemMetrics(); } catch { return null; }
}
async function fetchHealth() {
  try { return await window.api.getStatus(); } catch { return null; }
}
async function fetchMetrics() {
  try {
    const raw = await window.api.getLlmMetrics();
    if (!raw) return null;
    const toNum = (value) => {
      const num = typeof value === 'number' ? value : parseFloat(value);
      return Number.isFinite(num) ? num : 0;
    };
    // Transform Prometheus flat object to the shape update() expects
    // llama-server uses either 'llamacpp:metric' or 'llamacpp_metric' depending on version
    // Try multiple metric name variants (llama-server changed names across versions)
    const g = (...names) => {
      for (const name of names) {
        const v = raw['llamacpp:'+name] ?? raw['llamacpp_'+name] ?? raw[name];
        if (v !== undefined && v !== null) return toNum(v);
      }
      return 0;
    };
    // b8412 actual names: predicted_tokens_seconds, prompt_tokens_seconds
    const tps = g('predicted_tokens_seconds', 'tokens_predicted_seconds', 'tokens_predicted_per_second');
    const pts = g('prompt_tokens_seconds', 'prompt_tokens_per_second');
    const run = tps > 0 || g('requests_processing') > 0;
    const promptToks = g('prompt_tokens_total');
    const genToks = g('tokens_predicted_total');
    const promptSec = g('prompt_seconds_total');
    const genSec = g('tokens_predicted_seconds_total');
    const reqProc = g('requests_processing');
    const reqDef = g('requests_deferred');
    const reqFail = g('requests_errored_total', 'requests_failed_total', 'requests_error_total');
    const reqStarted = g('requests_total', 'requests_started_total', 'requests_created_total', 'requests_submitted_total');
    const reqCompleted = g('requests_completed_total', 'requests_success_total', 'requests_finished_total');
    const nDecode = g('n_decode_total');
    const reqTot = reqStarted || ((reqCompleted > 0 || reqFail > 0) ? (reqCompleted + reqFail + reqProc + reqDef) : 0);
    return {
      kv_ratio: g('kv_cache_usage_ratio'),
      kv_full: g('kv_cache_full_events'),
      req_proc: reqProc,
      req_def: reqDef,
      req_fail: reqFail,
      req_tot: reqTot,
      prompt_toks: promptToks,
      gen_toks: genToks,
      think_toks: 0,
      prefill_s: promptSec > 0 ? promptSec : (pts > 0 ? promptToks / pts : 0),
      eval_s: genSec > 0 ? genSec : (tps > 0 ? genToks / tps : 0),
      n_decode: nDecode || genToks,
      cache_hit: 0,
      _tps: tps,
      _pts: pts,
      _run: run,
    };
  } catch { return null; }
}
async function fetchSlots() {
  try { return await window.api.getLlmSlots(); } catch { return []; }
}

// â”€â”€ MAIN UPDATE â”€â”€
let _updating = false;
async function update(){
  if (_updating) return; // guard against overlapping async calls
  _updating = true;
  try { await _doUpdate(); } catch(e) { console.error('update error:', e); }
  _updating = false;
}
async function _doUpdate(){
  // Fetch all 3 data sources IN PARALLEL
  const [sys, health, rawMetrics, slots] = await Promise.all([fetchSys(), fetchHealth(), fetchMetrics(), fetchSlots()]);
  _lastRawMetrics = rawMetrics ? { ...rawMetrics } : null;
  const m = applyMetricResetBaselines(rawMetrics);
  // Find the active slot (is_processing) or the last-used slot (has params)
  let rawSl = {};
  if (slots && slots.length > 0) {
    rawSl = slots.find(s => s.is_processing) || slots.find(s => s.params || s.id_task) || slots[0];
  }
  const nt = rawSl.next_token && rawSl.next_token[0] || {};
  const num = (value, fallback = 0) => {
    const parsed = typeof value === 'number' ? value : parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const sl = {
    id: Number(rawSl.id) || 0,
    state: rawSl.is_processing ? 1 : (rawSl.state === 'processing' || rawSl.state === 1 ? 1 : 0),
    n_past: num(rawSl.n_past, num(nt.n_decoded, 0)),
    tokens_predicted: num(rawSl.tokens_predicted, num(nt.n_decoded, 0)),
    tokens_evaluated: num(rawSl.tokens_evaluated, 0),
    think_tokens: num(rawSl.think_tokens, 0),
    timing_prompt_ms: num(rawSl.timing_prompt_ms, num(rawSl.t_prompt_processing, 0)),
    timing_think_ms: num(rawSl.timing_think_ms, 0),
    timing_predicted_ms: num(rawSl.timing_predicted_ms, num(rawSl.t_token_generation, 0)),
    generation_settings: rawSl.params || rawSl.generation_settings || {},
    prompt: rawSl.prompt || '',
    n_ctx: num(rawSl.n_ctx, _CTX),
  };
  updateContextCapacity(sl.n_ctx);
  recordExternalHistoryIfNeeded(sl);
  const slotPromptT = getSlotPromptTokens(sl);
  const slotThinkT = getSlotThinkTokens(sl);
  const slotOutT = getSlotOutputTokens(sl);
  const slotUsedT = getSlotUsedTokens(sl);
  const slotTps = getRateFromTiming(sl.tokens_predicted, sl.timing_predicted_ms);
  const slotPts = getRateFromTiming(slotPromptT, sl.timing_prompt_ms);
  const activeSlots = Array.isArray(slots)
    ? slots.filter(s => s?.is_processing || s?.state === 'processing' || s?.state === 1).length
    : 0;
  const totalSlots = Array.isArray(slots) && slots.length > 0 ? slots.length : 1;
  const visibleActiveSlots = activeSlots > 0 ? activeSlots : (m?.req_proc || (sl.state === 1 ? 1 : 0));
  const queueDepth = m ? m.req_def : Math.max(0, totalSlots - visibleActiveSlots);
  const online = !!(rawMetrics || health?.running || (Array.isArray(slots) && slots.length > 0));

  // â”€â”€ SERVER-SIDE THINK TOKEN TRACKING â”€â”€
  // Detect when slot think_tokens resets (new request) â†’ accumulate previous
  const curSlotThink = sl.think_tokens;
  if (curSlotThink < _prevSlotThink) _slotThinkAccum += _prevSlotThink;
  _prevSlotThink = curSlotThink;

  // â”€â”€ SYSTEM METRICS (independent of LLM) â”€â”€
  if (sys) {
    if (!coresBuilt && sys.cpu.cores.length > 0) {
      buildCores(sys.cpu.cores.length);
      coresBuilt = true;
      const ct = document.getElementById('title-cpu');
      if (ct && sys.cpu.brand) ct.textContent = '[ CPU - ' + sys.cpu.brand + ' ]';
    }
    if (sys.disk) buildDisks(sys.disk);
    if (sys.gpu && sys.gpu.vramTotal) {
      _VMAX = sys.gpu.vramTotal;
      const gt = document.getElementById('title-gpu');
      if (gt && !gt._set) { gt.textContent = '[ ' + (sys.gpu.name || 'GPU') + ' ]'; gt._set = true; }
    }
    if (sys.mem && sys.mem.total) {
      _RMAX = sys.mem.total;
      const rt = document.getElementById('title-ram');
      if (rt && !rt._set) { rt.textContent = '[ ' + (sys.mem.label || 'RAM') + ' - ' + sys.mem.total.toFixed(0) + ' GB ]'; rt._set = true; }
    }
    if (sys.procs) renderProcs(sys.procs);

    // â”€â”€ PEAK TRACKING â”€â”€
    const avg=sys.cpu.cores.reduce((a,b)=>a+b.pct,0)/sys.cpu.cores.length;
    peaks.cpu=Math.max(peaks.cpu,avg);
    peaks.ram=Math.max(peaks.ram,sys.mem.used);
    if(sys.gpu&&sys.gpu.util!==undefined){peaks.gpuUtil=Math.max(peaks.gpuUtil,sys.gpu.util);peaks.gpuTemp=Math.max(peaks.gpuTemp,sys.gpu.temp||0);peaks.gpuPow=Math.max(peaks.gpuPow,sys.gpu.power||0);peaks.vram=Math.max(peaks.vram,sys.gpu.vramUsed||0);}

    // â”€â”€ CPU â”€â”€
  pushH('cpu',avg);
  setT('cpu-tot',avg.toFixed(0)+'%');setC('cpu-tot',ramp(avg));
  setT('cpu-freq',sys.cpu.freq ? sys.cpu.freq.toFixed(1)+' GHz' : '--');
  sys.cpu.cores.forEach((c,i)=>{setG('cr'+i,c.pct);const v=document.getElementById('cv'+i);if(v){v.textContent=c.pct.toFixed(0)+'%';v.style.color=ramp(c.pct);}});
  setSpark('sp-cpu',H.cpu,100);
  setT('sb-cpu',avg.toFixed(0)+'%');setC('sb-cpu',ramp(avg));

  // â”€â”€ GPU â”€â”€
  if (sys.gpu && sys.gpu.util !== undefined) {
  pushH('gpu',sys.gpu.util);
  const vp=sys.gpu.vramUsed/_VMAX*100;
  setG('g-gpuu',sys.gpu.util);setT('v-gpuu',sys.gpu.util.toFixed(0)+'%');setC('v-gpuu',ramp(sys.gpu.util));
  setSpark('sp-gpu',H.gpu,100);
  setG('g-vram',vp);setT('v-vram',sys.gpu.vramUsed.toFixed(1)+'G');setC('v-vram',ramp(vp));
  setT('v-gtem',sys.gpu.temp+' C');setT('v-gpow',sys.gpu.power+' W');setT('v-gclk',sys.gpu.coreClock+' MHz');
  setT('sb-gpu',sys.gpu.util.toFixed(0)+'%');setC('sb-gpu',ramp(sys.gpu.util));
  setT('sb-vram',sys.gpu.vramUsed.toFixed(1)+'/'+_VMAX+'G');setC('sb-vram',ramp(vp));
  }

  // â”€â”€ MEM â”€â”€
  const mp=sys.mem.used/sys.mem.total*100;
  pushH('mem',mp);
  setG('g-muse',mp);setT('v-muse',sys.mem.used.toFixed(1)+'G');setC('v-muse',ramp(mp));
  setT('sb-ram',sys.mem.used.toFixed(1)+'G');setC('sb-ram',ramp(mp));

  // â”€â”€ NET â”€â”€
  MAX_NET=Math.max(MAX_NET,sys.net.dl*1.5,sys.net.ul*1.5,1);
  setG('g-ndl',sys.net.dl/MAX_NET*100,'var(--gr)');setT('v-ndl',sys.net.dl.toFixed(2)+'M/s');
  setG('g-nul',sys.net.ul/MAX_NET*100,'var(--or)');setT('v-nul',sys.net.ul.toFixed(2)+'M/s');
    setT('v-nrx',sys.net.rxTotal);setT('v-ntx',sys.net.txTotal);
  } // end if (sys)

  // â”€â”€ MINI HUD (must update even without LLM) â”€â”€
  if (sys) updateMini(sys, m, sl);

  // â”€â”€ LLM HERO â”€â”€
  if (!online) {
    // server not running - set LLM status to stopped
    const stEl=document.getElementById('lhs-st');
    if(stEl){stEl.textContent='* STOPPED';stEl.style.color='var(--rd)';}
    const sbLlm=document.getElementById('sb-llm');
    if(sbLlm){sbLlm.textContent='* STOPPED';sbLlm.style.color='var(--rd)';}
    const tbSt=document.getElementById('tb-status');
    if(tbSt){tbSt.textContent='* stopped';tbSt.style.color='var(--rd)';}
    t0=0; // reset LLM uptime
    return;
  }
  // Server is reachable via metrics, slots, or health
  if(!t0) t0=Date.now(); // start LLM uptime counter
  {
    const tbSt=document.getElementById('tb-status');
    if(tbSt){tbSt.textContent='* running';tbSt.style.color='var(--gr)';}
  }
  const tps=m ? m._tps : slotTps;
  const pts=m ? m._pts : slotPts;
  if(tps>0){peakTps=Math.max(peakTps,tps);peaks.tps=peakTps;MAX_TPS=Math.max(60,Math.ceil(peakTps*1.3));}
  pushH('tps',tps);
  setT('h-tps',tps>0?tps.toFixed(1):'--');setT('h-pts',pts>0?pts.toFixed(0):'--');
  setG('g-htps',tps/MAX_TPS*100,ramp(100-tps/MAX_TPS*80));
  setG('g-hpts',pts/MAX_PTS*100,'var(--gr)');
  setSpark('sp-tps',H.tps,MAX_TPS);
  setT('sb-tps',tps>0?tps.toFixed(1):'--');setC('sb-tps',tps>0?ramp(100-tps/MAX_TPS*80):'var(--fg2)');

  setT('h-slot',visibleActiveSlots+'/'+Math.max(1,totalSlots));setT('h-q',queueDepth);

  const total=m && m.req_tot>0 ? Math.floor(m.req_tot) : Math.max(_derivedReqTotal, reqHist.length);
  setT('h-req',total>0?String(total):'--');
  const successPct=total>0?Math.max(0,((total-(m?.req_fail||0))/total)*100):0;
  setT('h-suc',total>0?successPct.toFixed(0)+'%':'--%');
  const rpm=prevReq>0?(total-prevReq)*(60/(AS.pollInterval/1000)):0;prevReq=total;
  setT('h-rpm',total>0?rpm.toFixed(1):'--');

  const isGenerating=(m ? m._run : false) || sl.state===1 || visibleActiveSlots>0;
  const stEl=document.getElementById('lhs-st');
  if(stEl){stEl.textContent=isGenerating?'* GENERATING':'* ONLINE';stEl.style.color=isGenerating?'var(--or)':'var(--gr)';}
  const sbLlm=document.getElementById('sb-llm');
  if(sbLlm){sbLlm.textContent=isGenerating?'* GENERATING':'* ONLINE';sbLlm.style.color=isGenerating?'var(--or)':'var(--gr)';}

  // â”€â”€ CONTEXT (use Prometheus totals + server-side thinking from /slots) â”€â”€
  const totalUsedMetrics = (m?.prompt_toks || 0) + (m?.gen_toks || 0);
  const histTok = getHistoryTokenTotals();
  const chatTok = typeof getChatSessionTokenStats === 'function'
    ? getChatSessionTokenStats()
    : { thinkToks: 0, contentToks: 0, lastThinkToks: 0, lastContentToks: 0 };
  const lastThinkT = chatTok.lastThinkToks || Number(_lastChatTimings?._thinkToks) || 0;
  const liveThinkT = _slotThinkAccum + curSlotThink;
  const slotHasContext = slotUsedT > 0 || slotPromptT > 0 || sl.tokens_predicted > 0;
  const promT = slotHasContext ? slotPromptT : (m?.prompt_toks || 0);
  const thkT = slotHasContext
    ? Math.max(slotThinkT, liveThinkT)
    : Math.min(m?.gen_toks || 0, Math.max(liveThinkT, chatTok.thinkToks, histTok.thk, lastThinkT));
  const outT = slotHasContext ? slotOutT : Math.max(0, (m?.gen_toks || 0) - thkT);
  const totalUsed = slotHasContext ? Math.max(slotUsedT, promT + thkT + outT) : totalUsedMetrics;
  const freeT = Math.max(0, _CTX - totalUsed);
  const ctxp = Math.min(100, totalUsed / _CTX * 100);
  const fi = n => Math.max(.05, n / Math.max(1, totalUsed + freeT) * 100);
  document.getElementById('ctx-sys').style.flex = fi(0);
  document.getElementById('ctx-thk').style.flex = fi(thkT);
  document.getElementById('ctx-prom').style.flex = fi(promT);
  document.getElementById('ctx-out').style.flex = fi(Math.max(0, outT));
  document.getElementById('ctx-free').style.flex = fi(freeT);
  setG('g-ctx', ctxp); document.getElementById('g-ctx').style.background = ramp(ctxp);
  setT('v-ctx', ctxp.toFixed(1) + '%'); setC('v-ctx', ramp(ctxp));
  setT('v-ctxu', totalUsed.toLocaleString()); setT('v-ctxf', freeT.toLocaleString());
  setT('v-think', thkT > 0 ? thkT.toLocaleString() : '--');
  setT('v-ctxo', (outT > 0 ? outT : m.gen_toks).toLocaleString());

  // â”€â”€ TOKEN TOTALS (Prometheus + server thinking split) â”€â”€
  const sessionThinkT = chatTok.thinkToks > 0 ? chatTok.thinkToks : (histTok.thk > 0 ? histTok.thk : thkT);
  const sessionOutT = chatTok.contentToks > 0 ? chatTok.contentToks : (histTok.out > 0 ? histTok.out : Math.max(0, outT));
  const allT = promT + sessionThinkT + sessionOutT;

  setG('g-tprom', allT > 0 ? promT / allT * 100 : 0, 'var(--cy)'); setT('v-tprom', fmtTok(promT));
  setG('g-tthk', allT > 0 ? sessionThinkT / allT * 100 : 0, 'var(--am)'); setT('v-tthk', fmtTok(sessionThinkT));
  setG('g-tout', allT > 0 ? sessionOutT / allT * 100 : 0, 'var(--gr)'); setT('v-tout', fmtTok(sessionOutT));
  setT('v-peak', peakTps > 0 ? peakTps.toFixed(1) + ' t/s' : '--');

  // â”€â”€ SLOT MONITOR â”€â”€
  const isRun=sl.state===1;
  setT('slt-st',isRun?'running':'idle');setC('slt-st',isRun?'var(--gr)':'var(--fg2)');
  const sb=document.getElementById('slt-body');
  const p=sl.generation_settings||{};
  const lastTtft=_lastChatTimings?_lastChatTimings.prompt_ms:(sl.timing_prompt_ms||0);
  const lastTps=_lastChatTimings?_lastChatTimings.predicted_per_second:(slotTps||0);
  clearNode(sb);
  const kv = createDiv(undefined, undefined, 'kv');
  kv.appendChild(createSpan('k', 'State'));
  const state = createSpan('v', isRun ? 'RUNNING' : 'IDLE');
  state.style.color = isRun ? 'var(--gr)' : 'var(--fg2)';
  kv.appendChild(state);
  sb.appendChild(kv);

  const statsRow = createDiv(undefined, 'display:flex;gap:10px;font-size:10px;flex-wrap:wrap;');
  [
    ['out', fmtTok(slotOutT || m?.gen_toks || 0), 'var(--gr)'],
    ['prompt', fmtTok(slotPromptT || m?.prompt_toks || 0), 'var(--cy)'],
    ['ttft', lastTtft > 0 ? lastTtft.toFixed(0) + 'ms' : '--', 'var(--am)'],
    ['t/s', lastTps > 0 ? lastTps.toFixed(1) : '--', 'var(--or)'],
  ].forEach(([label, value, color]) => {
    const wrap = document.createElement('span');
    wrap.appendChild(createSpan('', label + ' '));
    wrap.firstChild.style.color = 'var(--fg2)';
    const val = createSpan('', value);
    val.style.color = color;
    wrap.appendChild(val);
    statsRow.appendChild(wrap);
  });
  sb.appendChild(statsRow);

  const paramsRow = createDiv(undefined, 'display:flex;gap:10px;font-size:10px;flex-wrap:wrap;margin-top:2px;');
  [
    ['temp', p.temperature ?? S.temperature],
    ['top_k', p.top_k ?? S.top_k],
    ['top_p', p.top_p ?? S.top_p],
    ['rep_p', p.repeat_penalty ?? S.repeat_penalty],
  ].forEach(([label, value]) => {
    const wrap = document.createElement('span');
    wrap.appendChild(createSpan('', label + ' '));
    wrap.firstChild.style.color = 'var(--fg3)';
    const val = createSpan('', String(value));
    val.style.color = 'var(--fg2)';
    wrap.appendChild(val);
    paramsRow.appendChild(wrap);
  });
  sb.appendChild(paramsRow);

  // â”€â”€ TTFT from chat timings + Prometheus â”€â”€
  const promMs = _lastChatTimings ? _lastChatTimings.prompt_ms : (sl.timing_prompt_ms || 0);
  // Also compute from Prometheus if available: prompt_seconds_total / prompt_tokens_total * 1000
  const promFromProm = m && m.prompt_toks > 0 && m.prefill_s > 0 ? (m.prefill_s / m.prompt_toks * 1000) : 0;
  const bestTtft = promMs > 0 ? promMs : promFromProm;
  if (bestTtft > 0 && (ttftH.length === 0 || ttftH[ttftH.length-1] !== bestTtft)) {
    if (promMs > 0) ttftH.push(promMs);
  }
  setT('h-ttft', bestTtft > 0 ? bestTtft.toFixed(0) + ' ms' : '--');
  const tavg = ttftH.length > 0 ? ttftH.reduce((a,b)=>a+b,0)/ttftH.length : 0;
  setT('h-ttft-avg', tavg > 0 ? tavg.toFixed(0) + ' ms' : '--');

  // â”€â”€ ALERTS â”€â”€
  if (sys) checkAlerts(sys, m || { kv_ratio: totalUsed / Math.max(1, _CTX), req_def: queueDepth, req_proc: visibleActiveSlots }, sl);
}

// â”€â”€ LOG â”€â”€
function addLogEntry(lvl,msg){
  const c=document.getElementById('log-lines');
  const now=new Date().toTimeString().slice(0,8);
  appendLogLine(c, now, lvl, msg);
  while(c.children.length>AS.maxLogLines)c.removeChild(c.firstChild);
}

let _lastLogContent = '';
async function fetchAndDisplayLogs() {
  try {
    const raw = await window.api.getLogs(80);
    if (raw === _lastLogContent) return;
    if (raw === '(no logs)' || !raw.trim()) {
      _lastLogContent = raw;
      const c = document.getElementById('log-lines');
      if (c) clearNode(c);
      return;
    }
    const oldLines = _lastLogContent ? _lastLogContent.split('\n') : [];
    _lastLogContent = raw;
    const newLines = raw.split('\n');
    // Find where old content ends to only append new lines
    let startIdx = 0;
    if (oldLines.length > 0) {
      const lastOld = oldLines[oldLines.length - 1];
      if (lastOld) { for (let i = newLines.length - 1; i >= 0; i--) { if (newLines[i] === lastOld) { startIdx = i + 1; break; } } }
    }
    const c = document.getElementById('log-lines');
    for (let i = startIdx; i < newLines.length; i++) {
      const line = newLines[i];
      if (!line.trim()) continue;
      if (/all slots are idle|done request: GET \/(slots|health|metrics)|new request: GET \/(slots|health|metrics)|cancel task, id_task/.test(line)) continue;
      let lvl = 'INFO';
      if (/\b(error|err|fail)\b/i.test(line)) lvl = 'ERR';
      else if (/\b(warn|warning)\b/i.test(line)) lvl = 'WARN';
      else if (/\b(debug|dbg)\b/i.test(line)) lvl = 'DBG';
      const ts = line.match(/^(\d{4}[-/]\d{2}[-/]\d{2}\s+\d{2}:\d{2}:\d{2})/);
      const tsStr = ts ? ts[1] : '';
      const msg = tsStr ? line.slice(tsStr.length).trim() : line;
      appendLogLine(c, tsStr || new Date().toTimeString().slice(0,8), lvl, msg);
    }
    while(c.children.length>(AS.maxLogLines||100))c.removeChild(c.firstChild);
  } catch {}
}

// â”€â”€ CPU COMPACT TOGGLE â”€â”€
let _cpuCompact = false;
function toggleCpuCompact() {
  _cpuCompact = !_cpuCompact;
  const det = document.getElementById('cpu-details');
  const btn = document.getElementById('cpu-toggle-btn');
  if (det) det.style.display = _cpuCompact ? 'none' : '';
  if (btn) btn.textContent = _cpuCompact ? '>' : 'v';
}

// â”€â”€ HEALTH POPUP â”€â”€
function toggleHealthPopup(e) {
  let pop = document.getElementById('health-popup');
  if (pop) { pop.remove(); return; }
  // Position above the clicked segment
  const seg = e ? e.currentTarget || e.target.closest('.sb-seg') : null;
  const rect = seg ? seg.getBoundingClientRect() : {left:200,top:0};
  pop = document.createElement('div');
  pop.id = 'health-popup';
  pop.style.cssText = 'position:fixed;z-index:9999;background:var(--bg1);border:1px solid var(--bdr);font-family:var(--f);font-size:10px;width:260px;max-height:340px;display:flex;flex-direction:column;';
  pop.style.left = rect.left + 'px';
  pop.style.bottom = (window.innerHeight - rect.top + 2) + 'px';

  const peakRows = [
    ['CPU max', peaks.cpu.toFixed(0)+'%', ramp(peaks.cpu)],
    ['GPU max', peaks.gpuUtil.toFixed(0)+'%', ramp(peaks.gpuUtil)],
    ['GPU temp max', peaks.gpuTemp+' C', peaks.gpuTemp>80?'var(--rd)':peaks.gpuTemp>65?'var(--am)':'var(--gr)'],
    ['GPU power max', peaks.gpuPow+'W', 'var(--or)'],
    ['VRAM max', peaks.vram.toFixed(1)+'G', ramp(peaks.vram/_VMAX*100)],
    ['RAM max', peaks.ram.toFixed(1)+'G', ramp(peaks.ram/_RMAX*100)],
    ['Gen t/s peak', peaks.tps>0?peaks.tps.toFixed(1):'--', 'var(--or)'],
  ];

  const header = createDiv(undefined, 'padding:4px 8px;background:var(--bg);border-bottom:1px solid var(--bdr);display:flex;justify-content:space-between;align-items:center;');
  header.appendChild(createDiv('SYSTEM HEALTH', 'color:var(--fg2);letter-spacing:2px;font-size:9px;'));
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'x';
  closeBtn.style.cssText = 'background:none;border:none;color:var(--fg3);cursor:pointer;font-family:var(--f);font-size:10px;';
  closeBtn.onclick = () => pop.remove();
  header.appendChild(closeBtn);
  pop.appendChild(header);

  const peaksWrap = createDiv(undefined, 'padding:6px 8px;display:flex;flex-direction:column;gap:2px;');
  peaksWrap.appendChild(createDiv('PEAKS (SESSION)', 'font-size:9px;color:var(--fg3);letter-spacing:1px;'));
  peakRows.forEach(([k, v, c]) => {
    const row = createDiv(undefined, 'display:flex;justify-content:space-between;');
    row.appendChild(createDiv(k, 'color:var(--fg2);'));
    row.appendChild(createDiv(v, 'color:' + c + ';font-weight:700'));
    peaksWrap.appendChild(row);
  });
  pop.appendChild(peaksWrap);

  if (alertLog.length > 0) {
    const alertsWrap = createDiv(undefined, 'border-top:1px solid var(--bdr);padding:6px 8px;flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:1px;');
    alertsWrap.appendChild(createDiv('RECENT ALERTS', 'font-size:9px;color:var(--fg3);letter-spacing:1px;'));
    alertLog.slice(0, 15).forEach((a) => {
      const col = a.level === 'crit' ? 'var(--rd)' : 'var(--am)';
      const row = createDiv(undefined, 'display:flex;gap:6px;font-size:9px;');
      row.appendChild(createDiv(a.ts, 'color:var(--fg3);'));
      row.appendChild(createDiv(a.msg, 'color:' + col));
      alertsWrap.appendChild(row);
    });
    pop.appendChild(alertsWrap);
  } else {
    pop.appendChild(createDiv('No alerts', 'border-top:1px solid var(--bdr);padding:6px 8px;font-size:9px;color:var(--fg3);'));
  }

  const footer = createDiv(undefined, 'border-top:1px solid var(--bdr);padding:4px 8px;');
  const clearBtn = document.createElement('button');
  clearBtn.textContent = 'clear alerts';
  clearBtn.style.cssText = 'width:100%;background:transparent;border:1px solid var(--bdr);color:var(--fg2);font-family:var(--f);font-size:9px;cursor:pointer;padding:2px 0;';
  clearBtn.onclick = () => {
    alertCount = 0;
    alertLog.length = 0;
    document.getElementById('alert-badge').textContent = '0';
    document.getElementById('alert-badge').className = 'alert-badge zero';
    pop.remove();
  };
  footer.appendChild(clearBtn);
  pop.appendChild(footer);
  document.body.appendChild(pop);
  // Close on outside click
  setTimeout(() => document.addEventListener('click', function _h(e){ if(!pop.contains(e.target)&&!e.target.closest('.sb-seg')){pop.remove();document.removeEventListener('click',_h);} }), 10);
}

// â”€â”€ APP SETTINGS POPUP â”€â”€
function toggleAppSettings(e) {
  let pop = document.getElementById('app-settings-popup');
  if (pop) { pop.remove(); return; }
  const btn = e ? e.currentTarget || e.target : null;
  const rect = btn ? btn.getBoundingClientRect() : {left:200,bottom:22};
  pop = document.createElement('div');
  pop.id = 'app-settings-popup';
  pop.style.cssText = 'position:fixed;z-index:9999;background:var(--bg1);border:1px solid var(--bdr);font-family:var(--f);font-size:10px;width:240px;display:flex;flex-direction:column;';
  pop.style.left = Math.min(rect.left, window.innerWidth - 250) + 'px';
  pop.style.top = (rect.bottom + 4) + 'px';

  const row = (label, id, val, min, max, unit) => {
    const wrap = createDiv(undefined, 'display:flex;justify-content:space-between;align-items:center;gap:4px;');
    wrap.appendChild(createDiv(label, 'color:var(--fg2);'));
    const controls = createDiv(undefined, 'display:flex;align-items:center;gap:3px;');
    const input = document.createElement('input');
    input.type = 'number';
    input.id = id;
    input.value = val;
    input.min = min;
    input.max = max;
    input.style.cssText = 'width:48px;background:var(--bg2);color:var(--wh);border:1px solid var(--bdr);font-family:var(--f);font-size:10px;padding:1px 3px;text-align:right;';
    controls.appendChild(input);
    controls.appendChild(createDiv(unit, 'color:var(--fg3);font-size:9px;width:16px;'));
    wrap.appendChild(controls);
    return wrap;
  };

  const header = createDiv(undefined, 'padding:4px 8px;background:var(--bg);border-bottom:1px solid var(--bdr);display:flex;justify-content:space-between;align-items:center;');
  header.appendChild(createDiv('APP SETTINGS', 'color:var(--fg2);letter-spacing:2px;font-size:9px;'));
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'x';
  closeBtn.style.cssText = 'background:none;border:none;color:var(--fg3);cursor:pointer;font-family:var(--f);font-size:10px;';
  closeBtn.onclick = () => pop.remove();
  header.appendChild(closeBtn);
  pop.appendChild(header);

  const alertsSection = createDiv(undefined, 'padding:6px 8px;display:flex;flex-direction:column;gap:4px;');
  alertsSection.appendChild(createDiv('ALERT THRESHOLDS', 'font-size:9px;color:var(--fg3);letter-spacing:1px;'));
  alertsSection.appendChild(row('CPU warn', 'as-cpu', AS.alertCpu, 50, 100, '%'));
  alertsSection.appendChild(row('GPU warn', 'as-gpu', AS.alertGpu, 50, 100, '%'));
  alertsSection.appendChild(row('GPU temp', 'as-gtemp', AS.alertGpuTemp, 60, 100, 'C'));
  alertsSection.appendChild(row('VRAM warn', 'as-vram', AS.alertVram, 50, 100, '%'));
  alertsSection.appendChild(row('RAM warn', 'as-ram', AS.alertRam, 50, 100, '%'));
  pop.appendChild(alertsSection);

  const pollingSection = createDiv(undefined, 'border-top:1px solid var(--bdr);padding:6px 8px;display:flex;flex-direction:column;gap:4px;');
  pollingSection.appendChild(createDiv('POLLING', 'font-size:9px;color:var(--fg3);letter-spacing:1px;'));
  const pollRow = createDiv(undefined, 'display:flex;justify-content:space-between;align-items:center;');
  pollRow.appendChild(createDiv('Update interval', 'color:var(--fg2)'));
  const pollSelect = document.createElement('select');
  pollSelect.id = 'as-poll';
  pollSelect.style.cssText = 'background:var(--bg2);color:var(--wh);border:1px solid var(--bdr);font-family:var(--f);font-size:10px;padding:1px 3px;';
  [
    ['1000', '1s'],
    ['1500', '1.5s'],
    ['2000', '2s'],
    ['3000', '3s'],
    ['5000', '5s'],
  ].forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    option.selected = AS.pollInterval === parseInt(value, 10);
    pollSelect.appendChild(option);
  });
  pollRow.appendChild(pollSelect);
  pollingSection.appendChild(pollRow);
  pollingSection.appendChild(row('Max log lines', 'as-log', AS.maxLogLines, 5, 50, ''));
  pop.appendChild(pollingSection);

  const autoSection = createDiv(undefined, 'border-top:1px solid var(--bdr);padding:6px 8px;');
  const autoLabel = document.createElement('label');
  autoLabel.style.cssText = 'display:flex;align-items:center;gap:6px;cursor:pointer;color:var(--fg2);';
  const autoInput = document.createElement('input');
  autoInput.type = 'checkbox';
  autoInput.id = 'as-autostart';
  autoInput.checked = AS.autoStartServer;
  autoInput.style.accentColor = 'var(--or)';
  autoLabel.appendChild(autoInput);
  autoLabel.appendChild(document.createTextNode('Auto-start server on launch'));
  autoSection.appendChild(autoLabel);
  pop.appendChild(autoSection);

  const footer = createDiv(undefined, 'border-top:1px solid var(--bdr);padding:4px 8px;');
  const applyBtn = document.createElement('button');
  applyBtn.id = 'as-save-btn';
  applyBtn.textContent = 'apply';
  applyBtn.style.cssText = 'width:100%;background:transparent;border:1px solid var(--or);color:var(--or);font-family:var(--f);font-size:10px;cursor:pointer;padding:3px 0;transition:all .1s;';
  footer.appendChild(applyBtn);
  pop.appendChild(footer);
  document.body.appendChild(pop);

  applyBtn.onclick = () => {
    AS.alertCpu = parseInt(document.getElementById('as-cpu').value) || 90;
    AS.alertGpu = parseInt(document.getElementById('as-gpu').value) || 95;
    AS.alertGpuTemp = parseInt(document.getElementById('as-gtemp').value) || 85;
    AS.alertVram = parseInt(document.getElementById('as-vram').value) || 90;
    AS.alertRam = parseInt(document.getElementById('as-ram').value) || 85;
    AS.maxLogLines = parseInt(document.getElementById('as-log').value) || 14;
    AS.autoStartServer = document.getElementById('as-autostart').checked;
    const newPoll = parseInt(document.getElementById('as-poll').value) || 1500;
    if (newPoll !== AS.pollInterval) {
      AS.pollInterval = newPoll;
      if (_pollTimer) clearInterval(_pollTimer);
      if (_logTimer) clearInterval(_logTimer);
      _pollTimer = setInterval(update, AS.pollInterval);
      _logTimer = setInterval(fetchAndDisplayLogs, Math.max(AS.pollInterval * 2, 3000));
    }
    saveAS();
    pop.remove();
    addLogEntry('INFO', 'App settings updated');
  };

  setTimeout(() => document.addEventListener('click', function _h(e){ if(!pop.contains(e.target)&&!e.target.closest('.win-btn')){pop.remove();document.removeEventListener('click',_h);} }), 10);
}

function _renderHistory() {
  const tb = document.getElementById('hist-tb');
  if (!tb) return;
  clearNode(tb);
  reqHist.forEach(r => {
    const tr = document.createElement('tr');
    appendCell(tr, r.now, 'color:var(--fg3)');
    appendCell(tr, r.prompt, 'color:var(--fg2)');
    appendCell(tr, String(r.thk), 'text-align:right;color:var(--am)');
    appendCell(tr, String(r.out), 'text-align:right;color:var(--gr)');
    appendCell(tr, String(r.tpsVal), 'text-align:right;color:var(--or)');
    appendCell(tr, String(r.ttftVal), 'text-align:right;color:var(--cy)');
    appendCell(tr, String(r.totVal), 'text-align:right;color:var(--fg2)');
    tb.appendChild(tr);
  });
}

async function clearAllHistories() {
  reqHist = [];
  localStorage.setItem('nerv-req-hist', JSON.stringify(reqHist));
  _derivedReqTotal = 0;
  _trackedExternalReq = null;
  _renderHistory();

  ttftH.length = 0;
  prevReq = 0;
  peakTps = 0;
  MAX_TPS = 60;
  MAX_NET = 15;
  slotStartTime = null;
  lastTokenCount = 0;
  lastTokenTime = Date.now();

  for (const key of Object.keys(H)) H[key].length = 0;
  for (const key of Object.keys(peaks)) peaks[key] = 0;
  setSpark('sp-cpu', [], 100);
  setSpark('sp-gpu', [], 100);
  setSpark('sp-tps', [], MAX_TPS);

  setT('h-ttft', '-- ms');
  setT('h-ttft-avg', '-- ms');
  setT('h-req', '--');
  setT('h-suc', '--%');
  setT('h-rpm', '--');
  setT('v-tprom', '--');
  setT('v-tthk', '--');
  setT('v-tout', '--');
  setT('v-peak', '--');
  setT('m-ptoks', '--');
  setT('m-gtoks', '--');
  setT('m-peak', '--');

  alertCount = 0;
  alertDebounce = {};
  alertLog = [];
  document.querySelectorAll('.a-warn,.a-crit').forEach((el) => el.classList.remove('a-warn', 'a-crit'));
  const badge = document.getElementById('alert-badge');
  if (badge) {
    badge.textContent = '0';
    badge.className = 'alert-badge zero';
  }
  document.getElementById('health-popup')?.remove();

  _lastLogContent = '';
  clearNode(document.getElementById('log-lines'));
  try {
    const result = await window.api.clearLogs();
    if (!result?.ok) console.warn('clearLogs failed:', result?.msg || 'unknown');
  } catch (err) {
    console.warn('clearLogs error:', err);
  }

  if (typeof clearChatModuleHistory === 'function') clearChatModuleHistory();
  if (typeof clearTerminalModuleHistory === 'function') clearTerminalModuleHistory();

  if (_lastRawMetrics) setMetricResetBaselines(_lastRawMetrics);
  else _metricResetPending = true;

  setTimeout(() => { update(); }, 0);
}

// â”€â”€ BOX COLLAPSE â”€â”€
const _collapsed = safeJsonParse(localStorage.getItem('nerv-collapsed'), {});
function toggleBox(id) {
  const box = document.getElementById(id);
  if (!box) return;
  const body = box.querySelector('.box-body');
  const btn = box.querySelector('.box-collapse');
  if (!body) return;
  const hide = body.style.display !== 'none';
  body.style.display = hide ? 'none' : '';
  if (btn) btn.textContent = hide ? '+' : '-';
  // Collapse: shrink box to title-only height
  if (hide) { box.dataset.prevFlex = box.style.flex; box.style.flex = '0 0 16px'; box.style.minHeight = '16px'; }
  else { box.style.flex = box.dataset.prevFlex || '0 0 auto'; box.style.minHeight = ''; }
  _collapsed[id] = hide;
  localStorage.setItem('nerv-collapsed', JSON.stringify(_collapsed));
}
// Restore collapsed state on load
function restoreCollapsed() {
  for (const [id, val] of Object.entries(_collapsed)) { if (val) toggleBox(id); }
}

// â”€â”€ CLOCK â”€â”€
function clock(){
  const now=new Date();
  setT('sb-clk',now.toTimeString().slice(0,8));
  if(!t0){setT('sb-up','--');return;}
  const up=Math.floor((Date.now()-t0)/1000);
  const d=Math.floor(up/86400),h=Math.floor((up%86400)/3600),mn=Math.floor((up%3600)/60),s=up%60;
  setT('sb-up', d>0 ? d+'d '+String(h).padStart(2,'0')+':'+String(mn).padStart(2,'0') : h>0 ? h+'h'+String(mn).padStart(2,'0') : mn+'m'+String(s).padStart(2,'0')+'s');
}

// â”€â”€ RESIZE ENGINE with localStorage â”€â”€
const LS_KEY='nerv-tui-v3-sizes';
const FLEX_FILL_BOXES = {
  'box-prc': { flex: '1 1 60px', minHeight: '60px' },
  'box-chat': { flex: '1 0 60px', minHeight: '60px' },
};

function normalizeFillBoxes() {
  Object.entries(FLEX_FILL_BOXES).forEach(([id, cfg]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.flex = cfg.flex;
    el.style.minHeight = cfg.minHeight;
    el.style.height = '';
  });
}

function saveSizes(){
  try{
    const o={};
    ['box-cpu','box-gpu','box-mem','box-net','box-dsk','box-prc',
     'box-hero','box-kvc','box-flg','box-slt','box-hist','box-log','box-chat'].forEach(id=>{
      const e=document.getElementById(id);
      if(e&&e.style.height&&!FLEX_FILL_BOXES[id])o[id]=e.style.height;
    });
    const sb=document.getElementById('sidebar');
    if(sb&&sb.style.width)o['__sb']=sb.style.width;
    localStorage.setItem(LS_KEY,JSON.stringify(o));
  }catch(e){}
}

function restoreSizes(){
  try{
    const o=safeJsonParse(localStorage.getItem(LS_KEY), {});
    Object.entries(o).forEach(([id,h])=>{
      if(id==='__sb'){
        const e=document.getElementById('sidebar');
        if(e){e.style.width=h;e.style.flex='none';}
      }else{
        const e=document.getElementById(id);
        if(e&&h){
          e.style.height=h;e.style.flex='none';
        }
      }
    });
    normalizeFillBoxes();
  }catch(e){}
}

// Vertical drag
(()=>{
  const handle=document.getElementById('drag-main');
  const sidebar=document.getElementById('sidebar');
  let drag=false,sx=0,sw=0;
  handle.addEventListener('mousedown',e=>{drag=true;sx=e.clientX;sw=sidebar.offsetWidth;handle.classList.add('on');document.body.style.cursor='col-resize';e.preventDefault();});
  document.addEventListener('mousemove',e=>{if(!drag)return;const nw=Math.max(180,Math.min(600,sw+(e.clientX-sx)));sidebar.style.width=nw+'px';sidebar.style.flex='none';});
  document.addEventListener('mouseup',()=>{if(!drag)return;drag=false;handle.classList.remove('on');document.body.style.cursor='';normalizeFillBoxes();saveSizes();});
})();

// Horizontal drags
document.querySelectorAll('.drag-h').forEach(handle=>{
  const aId=handle.dataset.a,bId=handle.dataset.b;
  let drag=false,sy=0,sah=0,sbh=0;
  handle.addEventListener('mousedown',e=>{
    const a=document.getElementById(aId),b=document.getElementById(bId);
    if(!a||!b)return;
    drag=true;sy=e.clientY;sah=a.offsetHeight;sbh=b.offsetHeight;
    handle.classList.add('on');document.body.style.cursor='row-resize';e.preventDefault();
  });
  document.addEventListener('mousemove',e=>{
    if(!drag)return;
    const a=document.getElementById(aId),b=document.getElementById(bId);
    if(!a||!b)return;
    const dy=e.clientY-sy;
    const minA=38, minB=38;
    const na=Math.max(minA,sah+dy),nb=Math.max(minB,sbh-dy);
    a.style.flex='none';a.style.height=na+'px';
    b.style.flex='none';b.style.height=nb+'px';
  });
  document.addEventListener('mouseup',()=>{if(!drag)return;drag=false;handle.classList.remove('on');document.body.style.cursor='';normalizeFillBoxes();saveSizes();});
});

window.addEventListener('resize', normalizeFillBoxes);

