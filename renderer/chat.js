// â”€â”€ CHAT â”€â”€
let LLM_CHAT_URL = 'http://localhost:8080/v1/chat/completions';
const chatHistory = [];
let chatBusy = false;
let _chatAbort = null;
let _lastChatTimings = null; // captured from SSE stream for TTFT/History
let _sessionThinkToks = 0, _sessionContentToks = 0; // client-side thinking token tracking
let _slotThinkAccum = 0, _prevSlotThink = 0; // server-side thinking token accumulator
let _thinkHidden = false;

if (typeof reqHist !== 'undefined' && Array.isArray(reqHist)) {
  _sessionThinkToks = reqHist.reduce((sum, entry) => sum + (Number.isFinite(Number(entry?.thk)) ? Number(entry.thk) : 0), 0);
  _sessionContentToks = reqHist.reduce((sum, entry) => sum + (Number.isFinite(Number(entry?.out)) ? Number(entry.out) : 0), 0);
}

function getChatSessionTokenStats() {
  return {
    thinkToks: Number.isFinite(_sessionThinkToks) ? _sessionThinkToks : 0,
    contentToks: Number.isFinite(_sessionContentToks) ? _sessionContentToks : 0,
    lastThinkToks: Number(_lastChatTimings?._thinkToks) || 0,
    lastContentToks: Number(_lastChatTimings?._contentToks) || 0,
  };
}
function toggleThinkVisibility() {
  _thinkHidden = !_thinkHidden;
  const btn = document.getElementById('btn-think-toggle');
  if (btn) { btn.textContent = _thinkHidden ? 'think:off' : 'think:on'; btn.style.color = _thinkHidden ? 'var(--fg3)' : 'var(--am)'; }
  document.querySelectorAll('#chat-msgs .chat-msg.thinking').forEach(el => {
    el.style.display = _thinkHidden ? 'none' : '';
  });
}

function chatAddMsg(role, text, streaming) {
  const msgs = document.getElementById('chat-msgs');
  const div = document.createElement('div');
  div.className = 'chat-msg ' + (role === 'user' ? 'user' : role === 'thinking' ? 'thinking' : 'assistant');

  const roleEl = document.createElement('div');
  roleEl.className = 'chat-msg-role ' + (role === 'user' ? 'role-user' : role === 'thinking' ? 'role-thinking' : 'role-assistant');
  roleEl.textContent = role === 'user' ? '> you' : role === 'thinking' ? '. thinking' : '> assistant';

  const textEl = document.createElement('div');
  textEl.className = 'chat-msg-text';
  textEl.textContent = text;

  if (streaming) {
    const cursor = document.createElement('span');
    cursor.className = 'chat-cursor';
    cursor.id = 'chat-cursor';
    textEl.appendChild(cursor);
  }

  div.appendChild(roleEl);
  div.appendChild(textEl);
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return textEl;
}

async function chatSend() {
  if (chatBusy) return;
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send');
  const text = input.value.trim();
  if (!text) return;

  chatBusy = true;
  input.value = '';
  input.style.color = 'var(--fg2)';
  sendBtn.style.color = 'var(--rd)';
  sendBtn.textContent = 'stop';

  chatHistory.push({ role: 'user', content: text });
  chatAddMsg('user', text);

  // â”€â”€ placeholders: thinking ABOVE assistant â”€â”€
  let thinkEl = null;
  let thinkWrapper = null; // wrapper div for hide/show
  let assistantEl = null;

  let fullText = '';
  try {
    _chatAbort = new AbortController();
    const resp = await fetch(LLM_CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: _chatAbort.signal,
      body: JSON.stringify({
        model: 'local',
        stream: true,
        messages: chatHistory,
        temperature: S.temperature,
        top_p: S.top_p,
        top_k: S.top_k,
        min_p: S.min_p,
        repeat_penalty: S.repeat_penalty,
        repeat_last_n: S.repeat_last_n,
        frequency_penalty: S.frequency_penalty,
        presence_penalty: S.presence_penalty,
        n_predict: S.n_predict > 0 ? S.n_predict : undefined,
        seed: S.seed >= 0 ? S.seed : undefined,
        stop: S.stop.length > 0 ? S.stop : undefined,
        samplers: S.samplers,
      }),
    });

    if (!resp.ok) throw new Error('HTTP ' + resp.status);

    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let thinkBuf = '';
    let sseBuffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (value) sseBuffer += dec.decode(value, { stream: true });
      if (done) sseBuffer += dec.decode();
      const lines = sseBuffer.split('\n');
      sseBuffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') continue;
        try {
          const j = JSON.parse(raw);
          const d = j.choices?.[0]?.delta || {};
          const content = d.content || '';
          const reasoning = d.reasoning_content || '';

          // reasoning_content = thinking tokens (deepseek format) â€” appears ABOVE response
          if (reasoning) {
            if (!thinkEl) {
              thinkWrapper = chatAddMsg('thinking', '', false);
              thinkEl = thinkWrapper;
            }
            thinkBuf += reasoning;
            thinkEl.textContent = thinkBuf;
            if (_thinkHidden && thinkWrapper) thinkWrapper.parentElement.style.display = 'none';
          }

          // content = actual response tokens â€” created AFTER thinking
          if (content) {
            if (!assistantEl) assistantEl = chatAddMsg('assistant', '', true);
            fullText += content;
            const cur = document.getElementById('chat-cursor');
            if (assistantEl) {
              assistantEl.textContent = fullText;
              if (cur) assistantEl.appendChild(cur);
            }
          }

          // Capture timings from the final event (has finish_reason)
          if (j.timings) _lastChatTimings = j.timings;

          if (content || reasoning) {
            document.getElementById('chat-msgs').scrollTop = document.getElementById('chat-msgs').scrollHeight;
          }
        } catch (_) {}
      }
      if (done) break;
    }

    // If no content was received (pure thinking response), show thinking as response
    if (!assistantEl && thinkBuf) {
      assistantEl = chatAddMsg('assistant', thinkBuf, false);
    }
    // remove cursor
    const cur = document.getElementById('chat-cursor');
    if (cur) cur.remove();
    chatHistory.push({ role: 'assistant', content: fullText || thinkBuf });

    // Estimate thinking vs content token split from char lengths
    const thinkLen = thinkBuf.length;
    const contentLen = fullText.length;
    const totalLen = thinkLen + contentLen;
    if (_lastChatTimings && _lastChatTimings.predicted_n > 0 && totalLen > 0) {
      const t = _lastChatTimings;
      const ratio = thinkLen / totalLen;
      const thkToks = Math.round(t.predicted_n * ratio);
      const outToks = t.predicted_n - thkToks;
      _sessionThinkToks += thkToks;
      _sessionContentToks += outToks;
      // Enrich timings with thinking data
      _lastChatTimings._thinkToks = thkToks;
      _lastChatTimings._contentToks = outToks;

      const now = new Date().toTimeString().slice(0,8);
      const promptPreview = text.slice(0, 40);
      const tpsVal = t.predicted_per_second ? t.predicted_per_second.toFixed(1) : '--';
      const ttftVal = t.prompt_ms ? t.prompt_ms.toFixed(0) + 'ms' : '--';
      const totMs = (t.prompt_ms||0) + (t.predicted_ms||0);
      const totVal = totMs > 0 ? (totMs/1000).toFixed(1) + 's' : '--';
      reqHist.unshift({now, prompt:promptPreview, thk:thkToks, out:outToks, tpsVal, ttftVal, totVal});
      if (reqHist.length > 20) reqHist.pop();
      localStorage.setItem('nerv-req-hist', JSON.stringify(reqHist));
      _renderHistory();
      if (t.prompt_ms > 0) ttftH.push(t.prompt_ms);
    }

  } catch (err) {
    const cur = document.getElementById('chat-cursor');
    if (cur) cur.remove();
    if (err.name === 'AbortError') {
      // User stopped the stream - keep what we have
      chatHistory.push({ role: 'assistant', content: fullText || '' });
    } else if (assistantEl) {
      assistantEl.textContent = '[error: ' + err.message + ']'; assistantEl.style.color = 'var(--rd)';
    }
  }

  chatBusy = false;
  _chatAbort = null;
  sendBtn.textContent = 'send';
  sendBtn.style.color = 'var(--cy)';
  input.style.color = 'var(--fg)';
  input.focus();
}

function chatStopStream() {
  if (_chatAbort) { _chatAbort.abort(); _chatAbort = null; }
}

// keyboard shortcut
document.addEventListener('keydown', e => {
  const inp = document.getElementById('chat-input');
  if (document.activeElement === inp) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); chatSend(); }
  }
});
document.getElementById('chat-send').addEventListener('click', () => {
  if (chatBusy) { chatStopStream(); } else { chatSend(); }
});

// â”€â”€ LLM ACTION â”€â”€
let _isRunning = false;
async function llmAction(action) {
  const statusEl = document.getElementById('tb-status');
  const lhsEl = document.getElementById('lhs-st');
  const sbEl = document.getElementById('sb-llm');

  // Show loading state
  if (statusEl) { statusEl.textContent = '* ' + action + '...'; statusEl.style.color = 'var(--am)'; }
  if (lhsEl) { lhsEl.textContent = '* ' + action.toUpperCase() + '...'; lhsEl.style.color = 'var(--am)'; }
  if (sbEl) { sbEl.textContent = '* ' + action.toUpperCase() + '...'; sbEl.style.color = 'var(--am)'; }
  addLogEntry('INFO', 'llama-server ' + action + ' requested');

  try {
    let result;
    if (action === 'start') result = await window.api.start();
    else if (action === 'stop') result = await window.api.stop();
    else if (action === 'reboot') result = await window.api.reboot();

    if (result && result.ok) {
      _isRunning = (action !== 'stop');
      t0 = _isRunning ? Date.now() : 0; // reset LLM uptime
      if (statusEl) { statusEl.textContent = _isRunning ? '* running' : '* stopped'; statusEl.style.color = _isRunning ? 'var(--gr)' : 'var(--rd)'; }
      if (lhsEl) { lhsEl.textContent = _isRunning ? '* RUNNING' : '* STOPPED'; lhsEl.style.color = _isRunning ? 'var(--gr)' : 'var(--rd)'; }
      if (sbEl) { sbEl.textContent = _isRunning ? '* RUNNING' : '* STOPPED'; sbEl.style.color = _isRunning ? 'var(--gr)' : 'var(--rd)'; }
      addLogEntry('INFO', 'llama-server ' + (result.msg || action + ' ok'));
      if (_isRunning) { await initPorts(); updateFlags(); }
    } else {
      addLogEntry('ERR', 'llama-server ' + action + ' failed: ' + (result?.msg || 'unknown'));
      if (statusEl) { statusEl.textContent = '* error'; statusEl.style.color = 'var(--rd)'; }
    }
  } catch (err) {
    addLogEntry('ERR', action + ' error: ' + err.message);
    if (statusEl) { statusEl.textContent = '* error'; statusEl.style.color = 'var(--rd)'; }
  }
}
