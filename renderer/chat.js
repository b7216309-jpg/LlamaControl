// LLM ACTIONS
let _isRunning = false;

async function killAllSlots() {
  addLogEntry('INFO', 'Kill all slots requested');
  try {
    const result = await window.api.killAllSlots();
    addLogEntry(result.ok ? 'INFO' : 'ERR', result.msg || 'kill-all-slots done');
  } catch (err) {
    addLogEntry('ERR', 'kill-all-slots error: ' + err.message);
  }
}

async function llmAction(action) {
  const statusEl = document.getElementById('tb-status');
  const lhsEl = document.getElementById('lhs-st');
  const sbEl = document.getElementById('sb-llm');

  if (statusEl) {
    statusEl.textContent = '* ' + action + '...';
    statusEl.style.color = 'var(--am)';
  }
  if (lhsEl) {
    lhsEl.textContent = '* ' + action.toUpperCase() + '...';
    lhsEl.style.color = 'var(--am)';
  }
  if (sbEl) {
    sbEl.textContent = '* ' + action.toUpperCase() + '...';
    sbEl.style.color = 'var(--am)';
  }
  addLogEntry('INFO', 'llama-server ' + action + ' requested');

  try {
    let result;
    if (action === 'start') result = await window.api.start();
    else if (action === 'stop') result = await window.api.stop();
    else if (action === 'reboot') result = await window.api.reboot();

    if (result && result.ok) {
      _isRunning = action !== 'stop';
      t0 = _isRunning ? Date.now() : 0;
      if (statusEl) {
        statusEl.textContent = _isRunning ? '* running' : '* stopped';
        statusEl.style.color = _isRunning ? 'var(--gr)' : 'var(--rd)';
      }
      if (lhsEl) {
        lhsEl.textContent = _isRunning ? '* RUNNING' : '* STOPPED';
        lhsEl.style.color = _isRunning ? 'var(--gr)' : 'var(--rd)';
      }
      if (sbEl) {
        sbEl.textContent = _isRunning ? '* RUNNING' : '* STOPPED';
        sbEl.style.color = _isRunning ? 'var(--gr)' : 'var(--rd)';
      }
      addLogEntry('INFO', 'llama-server ' + (result.msg || action + ' ok'));
      if (_isRunning) {
        await initPorts();
        updateFlags();
      }
    } else {
      addLogEntry('ERR', 'llama-server ' + action + ' failed: ' + (result?.msg || 'unknown'));
      if (statusEl) {
        statusEl.textContent = '* error';
        statusEl.style.color = 'var(--rd)';
      }
    }
  } catch (err) {
    addLogEntry('ERR', action + ' error: ' + err.message);
    if (statusEl) {
      statusEl.textContent = '* error';
      statusEl.style.color = 'var(--rd)';
    }
  }
}
