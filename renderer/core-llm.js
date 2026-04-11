function renderOfflineLlmState() {
  const heroStatus = document.getElementById('lhs-st');
  if (heroStatus) {
    heroStatus.textContent = '* STOPPED';
    heroStatus.style.color = 'var(--rd)';
  }

  const statusBar = document.getElementById('sb-llm');
  if (statusBar) {
    statusBar.textContent = '* STOPPED';
    statusBar.style.color = 'var(--rd)';
  }

  const topbar = document.getElementById('tb-status');
  if (topbar) {
    topbar.textContent = '* stopped';
    topbar.style.color = 'var(--rd)';
  }

  t0 = 0;
}

function buildContextSnapshot(m, sl, state) {
  const totalUsedMetrics = (m?.prompt_toks || 0) + (m?.gen_toks || 0);
  const histTok = getHistoryTokenTotals();
  const chatTok = typeof getChatSessionTokenStats === 'function'
    ? getChatSessionTokenStats()
    : { thinkToks: 0, contentToks: 0, lastThinkToks: 0, lastContentToks: 0 };
  const lastChatThinkToks = typeof _lastChatTimings !== 'undefined' ? Number(_lastChatTimings?._thinkToks) || 0 : 0;
  const lastThinkT = chatTok.lastThinkToks || lastChatThinkToks;
  const liveThinkT = (typeof _slotThinkAccum !== 'undefined' ? _slotThinkAccum : 0) + state.curSlotThink;
  const slotHasContext = state.slotUsedT > 0 || state.slotPromptT > 0 || sl.tokens_predicted > 0;
  const promT = slotHasContext ? state.slotPromptT : (m?.prompt_toks || 0);
  const thkT = slotHasContext
    ? Math.max(state.slotThinkT, liveThinkT)
    : Math.min(m?.gen_toks || 0, Math.max(liveThinkT, chatTok.thinkToks, histTok.thk, lastThinkT));
  const outT = slotHasContext ? state.slotOutT : Math.max(0, (m?.gen_toks || 0) - thkT);
  const totalUsed = slotHasContext ? Math.max(state.slotUsedT, promT + thkT + outT) : totalUsedMetrics;
  const freeT = Math.max(0, _CTX - totalUsed);
  const ctxp = Math.min(100, totalUsed / _CTX * 100);
  const sessionThinkT = chatTok.thinkToks > 0 ? chatTok.thinkToks : (histTok.thk > 0 ? histTok.thk : thkT);
  const sessionOutT = chatTok.contentToks > 0 ? chatTok.contentToks : (histTok.out > 0 ? histTok.out : Math.max(0, outT));
  return {
    promT,
    thkT,
    outT,
    totalUsed,
    freeT,
    ctxp,
    sessionThinkT,
    sessionOutT,
    allT: promT + sessionThinkT + sessionOutT,
  };
}

function renderServerSummary(m, sl, state) {
  if (!t0) t0 = Date.now();

  const topbar = document.getElementById('tb-status');
  if (topbar) {
    topbar.textContent = '* running';
    topbar.style.color = 'var(--gr)';
  }

  const tps = m ? m._tps : state.slotTps;
  const pts = m ? m._pts : state.slotPts;
  if (tps > 0) {
    peakTps = Math.max(peakTps, tps);
    peaks.tps = peakTps;
    MAX_TPS = Math.max(60, Math.ceil(peakTps * 1.3));
  }

  pushH('tps', tps);
  setT('h-tps', tps > 0 ? tps.toFixed(1) : '--');
  setT('h-pts', pts > 0 ? pts.toFixed(0) : '--');
  setG('g-htps', tps / MAX_TPS * 100, ramp(100 - tps / MAX_TPS * 80));
  setG('g-hpts', pts / MAX_PTS * 100, 'var(--gr)');
  setSpark('sp-tps', H.tps, MAX_TPS);
  setT('sb-tps', tps > 0 ? tps.toFixed(1) : '--');
  setC('sb-tps', tps > 0 ? ramp(100 - tps / MAX_TPS * 80) : 'var(--fg2)');

  setT('h-slot', state.visibleActiveSlots + '/' + Math.max(1, state.totalSlots));
  setT('h-q', state.queueDepth);

  const totalReq = m && m.req_tot > 0 ? Math.floor(m.req_tot) : Math.max(_derivedReqTotal, reqHist.length);
  setT('h-req', totalReq > 0 ? String(totalReq) : '--');
  const successPct = totalReq > 0 ? Math.max(0, ((totalReq - (m?.req_fail || 0)) / totalReq) * 100) : 0;
  setT('h-suc', totalReq > 0 ? successPct.toFixed(0) + '%' : '--%');
  const rpm = prevReq > 0 ? (totalReq - prevReq) * (60 / (AS.pollInterval / 1000)) : 0;
  prevReq = totalReq;
  setT('h-rpm', totalReq > 0 ? rpm.toFixed(1) : '--');

  const isGenerating = (m ? m._run : false) || sl.state === 1 || state.visibleActiveSlots > 0;
  const heroStatus = document.getElementById('lhs-st');
  if (heroStatus) {
    heroStatus.textContent = isGenerating ? '* GENERATING' : '* ONLINE';
    heroStatus.style.color = isGenerating ? 'var(--or)' : 'var(--gr)';
  }

  const statusBar = document.getElementById('sb-llm');
  if (statusBar) {
    statusBar.textContent = isGenerating ? '* GENERATING' : '* ONLINE';
    statusBar.style.color = isGenerating ? 'var(--or)' : 'var(--gr)';
  }
}

function renderContextUsage(context, m) {
  const part = (value) => Math.max(0.05, value / Math.max(1, context.totalUsed + context.freeT) * 100);
  document.getElementById('ctx-sys').style.flex = part(0);
  document.getElementById('ctx-thk').style.flex = part(context.thkT);
  document.getElementById('ctx-prom').style.flex = part(context.promT);
  document.getElementById('ctx-out').style.flex = part(Math.max(0, context.outT));
  document.getElementById('ctx-free').style.flex = part(context.freeT);
  setG('g-ctx', context.ctxp);
  document.getElementById('g-ctx').style.background = ramp(context.ctxp);
  setT('v-ctx', context.ctxp.toFixed(1) + '%');
  setC('v-ctx', ramp(context.ctxp));
  setT('v-ctxu', context.totalUsed.toLocaleString());
  setT('v-ctxf', context.freeT.toLocaleString());
  setT('v-think', context.thkT > 0 ? context.thkT.toLocaleString() : '--');
  setT('v-ctxo', (context.outT > 0 ? context.outT : (m?.gen_toks || 0)).toLocaleString());
}

function renderTokenTotals(context) {
  setG('g-tprom', context.allT > 0 ? context.promT / context.allT * 100 : 0, 'var(--cy)');
  setT('v-tprom', fmtTok(context.promT));
  setG('g-tthk', context.allT > 0 ? context.sessionThinkT / context.allT * 100 : 0, 'var(--am)');
  setT('v-tthk', fmtTok(context.sessionThinkT));
  setG('g-tout', context.allT > 0 ? context.sessionOutT / context.allT * 100 : 0, 'var(--gr)');
  setT('v-tout', fmtTok(context.sessionOutT));
  setT('v-peak', peakTps > 0 ? peakTps.toFixed(1) + ' t/s' : '--');
}

function renderSlotMonitor(m, sl, state) {
  const isRunning = sl.state === 1;
  setT('slt-st', isRunning ? 'running' : 'idle');
  setC('slt-st', isRunning ? 'var(--gr)' : 'var(--fg2)');

  const body = document.getElementById('slt-body');
  const params = sl.generation_settings || {};
  const chatTimings = typeof _lastChatTimings !== 'undefined' ? _lastChatTimings : null;
  const lastTtft = chatTimings ? chatTimings.prompt_ms : (sl.timing_prompt_ms || 0);
  const lastTps = chatTimings ? chatTimings.predicted_per_second : (state.slotTps || 0);
  clearNode(body);

  const stateRow = createDiv(undefined, undefined, 'kv');
  stateRow.appendChild(createSpan('k', 'State'));
  const value = createSpan('v', isRunning ? 'RUNNING' : 'IDLE');
  value.style.color = isRunning ? 'var(--gr)' : 'var(--fg2)';
  stateRow.appendChild(value);
  body.appendChild(stateRow);

  const statsRow = createDiv(undefined, 'display:flex;gap:10px;font-size:10px;flex-wrap:wrap;');
  [
    ['out', fmtTok(state.slotOutT || m?.gen_toks || 0), 'var(--gr)'],
    ['prompt', fmtTok(state.slotPromptT || m?.prompt_toks || 0), 'var(--cy)'],
    ['ttft', lastTtft > 0 ? lastTtft.toFixed(0) + 'ms' : '--', 'var(--am)'],
    ['t/s', lastTps > 0 ? lastTps.toFixed(1) : '--', 'var(--or)'],
  ].forEach(([label, text, color]) => {
    const wrap = document.createElement('span');
    const key = createSpan('', label + ' ');
    key.style.color = 'var(--fg2)';
    wrap.appendChild(key);
    const val = createSpan('', text);
    val.style.color = color;
    wrap.appendChild(val);
    statsRow.appendChild(wrap);
  });
  body.appendChild(statsRow);

  const paramsRow = createDiv(undefined, 'display:flex;gap:10px;font-size:10px;flex-wrap:wrap;margin-top:2px;');
  [
    ['temp', params.temperature ?? S.temperature],
    ['top_k', params.top_k ?? S.top_k],
    ['top_p', params.top_p ?? S.top_p],
    ['rep_p', params.repeat_penalty ?? S.repeat_penalty],
  ].forEach(([label, paramValue]) => {
    const wrap = document.createElement('span');
    const key = createSpan('', label + ' ');
    key.style.color = 'var(--fg3)';
    wrap.appendChild(key);
    const val = createSpan('', String(paramValue));
    val.style.color = 'var(--fg2)';
    wrap.appendChild(val);
    paramsRow.appendChild(wrap);
  });
  body.appendChild(paramsRow);

  const promptMs = chatTimings ? chatTimings.prompt_ms : (sl.timing_prompt_ms || 0);
  const promptMsFromMetrics = m && m.prompt_toks > 0 && m.prefill_s > 0 ? (m.prefill_s / m.prompt_toks * 1000) : 0;
  const bestTtft = promptMs > 0 ? promptMs : promptMsFromMetrics;
  if (bestTtft > 0 && (ttftH.length === 0 || ttftH[ttftH.length - 1] !== bestTtft)) {
    if (promptMs > 0) ttftH.push(promptMs);
  }
  setT('h-ttft', bestTtft > 0 ? bestTtft.toFixed(0) + ' ms' : '--');
  const avgTtft = ttftH.length > 0 ? ttftH.reduce((sum, entry) => sum + entry, 0) / ttftH.length : 0;
  setT('h-ttft-avg', avgTtft > 0 ? avgTtft.toFixed(0) + ' ms' : '--');
}

function renderOnlineLlmState(m, sl, state) {
  renderServerSummary(m, sl, state);
  const context = buildContextSnapshot(m, sl, state);
  renderContextUsage(context, m);
  renderTokenTotals(context);
  renderSlotMonitor(m, sl, state);
  return context;
}
