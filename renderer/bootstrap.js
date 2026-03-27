// â”€â”€ INIT â”€â”€
async function init() {
  restoreSizes();
  restoreCollapsed();

  // Start companion for system metrics
  try { await window.api.startCompanion(); } catch {}

  // Load config and initialize
  await initPorts();
  await initSettings();
  await loadProfiles();
  await rescanModels();
  await loadPaths();
  updateFlags();

  // Check server status
  try {
    const status = await window.api.getStatus();
    _isRunning = status.running;
    const statusEl = document.getElementById('tb-status');
    const lhsEl = document.getElementById('lhs-st');
    const sbLlm = document.getElementById('sb-llm');
    if (status.running) {
      if (statusEl) { statusEl.textContent = '* running'; statusEl.style.color = 'var(--gr)'; }
      if (lhsEl) { lhsEl.textContent = '* RUNNING'; lhsEl.style.color = 'var(--gr)'; }
      if (sbLlm) { sbLlm.textContent = '* RUNNING'; sbLlm.style.color = 'var(--gr)'; }
    } else {
      if (statusEl) { statusEl.textContent = '* stopped'; statusEl.style.color = 'var(--rd)'; }
      if (lhsEl) { lhsEl.textContent = '* STOPPED'; lhsEl.style.color = 'var(--rd)'; }
      if (sbLlm) { sbLlm.textContent = '* STOPPED'; sbLlm.style.color = 'var(--rd)'; }
    }
  } catch {}

  // Auto-start server if enabled
  if (AS.autoStartServer) {
    try {
      const st = await window.api.getStatus();
      if (!st.running) { llmAction('start'); }
    } catch {}
  }

  // Start update loops
  clock();
  update();
  setInterval(clock, 1000);
  _pollTimer = setInterval(update, AS.pollInterval);
  _logTimer = setInterval(fetchAndDisplayLogs, Math.max(AS.pollInterval * 2, 3000));

  // Settings panel closed by default
  toggleSettings();
}
window.addEventListener('beforeunload', saveSizes);
init();

