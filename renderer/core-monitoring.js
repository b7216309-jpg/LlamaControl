let _updating = false;

function pickDisplaySlot(slots) {
  if (!Array.isArray(slots) || slots.length === 0) return {};
  return slots.find((slot) => slot.is_processing) || slots.find((slot) => slot.params || slot.id_task) || slots[0];
}

function num(value, fallback = 0) {
  const parsed = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeSlot(rawSlot) {
  const nextToken = rawSlot.next_token && rawSlot.next_token[0] || {};
  return {
    id: Number(rawSlot.id) || 0,
    state: rawSlot.is_processing ? 1 : (rawSlot.state === 'processing' || rawSlot.state === 1 ? 1 : 0),
    n_past: num(rawSlot.n_past, num(nextToken.n_decoded, 0)),
    tokens_predicted: num(rawSlot.tokens_predicted, num(nextToken.n_decoded, 0)),
    tokens_evaluated: num(rawSlot.tokens_evaluated, 0),
    think_tokens: num(rawSlot.think_tokens, 0),
    timing_prompt_ms: num(rawSlot.timing_prompt_ms, num(rawSlot.t_prompt_processing, 0)),
    timing_think_ms: num(rawSlot.timing_think_ms, 0),
    timing_predicted_ms: num(rawSlot.timing_predicted_ms, num(rawSlot.t_token_generation, 0)),
    generation_settings: rawSlot.params || rawSlot.generation_settings || {},
    prompt: rawSlot.prompt || '',
    n_ctx: num(rawSlot.n_ctx, _CTX),
  };
}

function buildMonitoringState(slots, m, rawMetrics, health, sl) {
  const slotPromptT = getSlotPromptTokens(sl);
  const slotThinkT = getSlotThinkTokens(sl);
  const slotOutT = getSlotOutputTokens(sl);
  const slotUsedT = getSlotUsedTokens(sl);
  const slotTps = getRateFromTiming(sl.tokens_predicted, sl.timing_predicted_ms);
  const slotPts = getRateFromTiming(slotPromptT, sl.timing_prompt_ms);
  const activeSlots = Array.isArray(slots)
    ? slots.filter((slot) => slot?.is_processing || slot?.state === 'processing' || slot?.state === 1).length
    : 0;
  const totalSlots = Array.isArray(slots) && slots.length > 0 ? slots.length : 1;
  const visibleActiveSlots = activeSlots > 0 ? activeSlots : (m?.req_proc || (sl.state === 1 ? 1 : 0));
  const queueDepth = m ? m.req_def : Math.max(0, totalSlots - visibleActiveSlots);
  const online = !!(rawMetrics || health?.running || (Array.isArray(slots) && slots.length > 0));
  return {
    slotPromptT,
    slotThinkT,
    slotOutT,
    slotUsedT,
    slotTps,
    slotPts,
    totalSlots,
    visibleActiveSlots,
    queueDepth,
    online,
    curSlotThink: sl.think_tokens,
  };
}

function trackServerThinkTokens(curSlotThink) {
  if (typeof _prevSlotThink === 'undefined' || typeof _slotThinkAccum === 'undefined') return;
  if (curSlotThink < _prevSlotThink) _slotThinkAccum += _prevSlotThink;
  _prevSlotThink = curSlotThink;
}

async function update() {
  if (_updating) return;
  _updating = true;
  try { await _doUpdate(); } catch (err) { console.error('update error:', err); }
  _updating = false;
}

async function _doUpdate() {
  const [sys, health, rawMetrics, slots] = await Promise.all([fetchSys(), fetchHealth(), fetchMetrics(), fetchSlots()]);
  _lastRawMetrics = rawMetrics ? { ...rawMetrics } : null;
  const m = applyMetricResetBaselines(rawMetrics);
  const sl = normalizeSlot(pickDisplaySlot(slots));
  updateContextCapacity(sl.n_ctx);
  recordExternalHistoryIfNeeded(sl);

  const state = buildMonitoringState(slots, m, rawMetrics, health, sl);
  trackServerThinkTokens(state.curSlotThink);

  if (sys) renderSystemMetrics(sys);
  if (sys) updateMini(sys, m, sl);

  if (!state.online) {
    renderOfflineLlmState();
    return;
  }

  const context = renderOnlineLlmState(m, sl, state);
  if (sys) {
    checkAlerts(sys, m || {
      kv_ratio: context.totalUsed / Math.max(1, _CTX),
      req_def: state.queueDepth,
      req_proc: state.visibleActiveSlots,
    }, sl);
  }
}
