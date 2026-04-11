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
