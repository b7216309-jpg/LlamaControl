function pushH(key, value) {
  H[key].push(value);
  if (H[key].length > HLEN) H[key].shift();
}

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
  const label = document.getElementById('ctx-cap-label');
  if (label) label.textContent = 'Context - ' + _CTX.toLocaleString();
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
