// CHAT STREAMING
// Use a loopback alias by default so WSL services on 127.0.0.1 do not shadow llama-server.
let LLM_CHAT_URL = 'http://127.0.0.2:8080/v1/chat/completions';
const chatHistory = [];
let chatBusy = false;
let _chatAbort = null;
let _lastChatTimings = null; // captured from SSE stream for TTFT/history
let _sessionThinkToks = 0, _sessionContentToks = 0; // client-side thinking token tracking
let _slotThinkAccum = 0, _prevSlotThink = 0; // server-side thinking token accumulator
let _thinkHidden = false;
let _activeInternalChat = false;
let _lastHistoryWriteAt = 0;
let _chatClearing = false;

if (typeof reqHist !== 'undefined' && Array.isArray(reqHist)) {
  _sessionThinkToks = reqHist.reduce((sum, entry) => sum + (Number.isFinite(Number(entry?.thk)) ? Number(entry.thk) : 0), 0);
  _sessionContentToks = reqHist.reduce((sum, entry) => sum + (Number.isFinite(Number(entry?.out)) ? Number(entry.out) : 0), 0);
}
async function chatSend() {
  if (chatBusy) return;
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send');
  const text = input.value.trim();
  if (!text) return;

  chatBusy = true;
  _activeInternalChat = true;
  input.value = '';
  input.style.color = 'var(--fg2)';
  sendBtn.style.color = 'var(--rd)';
  sendBtn.textContent = 'stop';

  chatHistory.push({ role: 'user', content: text });
  chatAddMsg('user', text);

  let thinkEl = null;
  let thinkWrapper = null;
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
        max_tokens: S.n_predict > 0 ? S.n_predict : undefined,
        seed: S.seed >= 0 ? S.seed : undefined,
        stop: S.stop.length > 0 ? S.stop : undefined,
        samplers: S.samplers,
        cache_prompt: S.cache_prompt,
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
          const payload = JSON.parse(raw);
          const delta = payload.choices?.[0]?.delta || {};
          const content = delta.content || '';
          const reasoning = delta.reasoning_content || '';

          if (reasoning) {
            if (!thinkEl) {
              thinkWrapper = chatAddMsg('thinking', '', false);
              thinkEl = thinkWrapper;
            }
            thinkBuf += reasoning;
            thinkEl.textContent = thinkBuf;
            if (_thinkHidden && thinkWrapper) thinkWrapper.parentElement.style.display = 'none';
          }

          if (content) {
            if (!assistantEl) assistantEl = chatAddMsg('assistant', '', true);
            fullText += content;
            const cursor = document.getElementById('chat-cursor');
            if (assistantEl) {
              assistantEl.textContent = fullText;
              if (cursor) assistantEl.appendChild(cursor);
            }
          }

          if (payload.timings) _lastChatTimings = payload.timings;

          if (content || reasoning) {
            const msgs = document.getElementById('chat-msgs');
            if ((msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight) <= 64) {
              msgs.scrollTop = msgs.scrollHeight;
            }
          }
        } catch (_) {}
      }

      if (done) break;
    }

    if (!assistantEl && thinkBuf) {
      assistantEl = chatAddMsg('assistant', thinkBuf, false);
    }

    const cursor = document.getElementById('chat-cursor');
    if (cursor) cursor.remove();
    chatHistory.push({ role: 'assistant', content: fullText || thinkBuf });

    const thinkLen = thinkBuf.length;
    const contentLen = fullText.length;
    const totalLen = thinkLen + contentLen;
    if (_lastChatTimings && _lastChatTimings.predicted_n > 0 && totalLen > 0) {
      const timings = _lastChatTimings;
      const ratio = thinkLen / totalLen;
      const thkToks = Math.round(timings.predicted_n * ratio);
      const outToks = timings.predicted_n - thkToks;
      _sessionThinkToks += thkToks;
      _sessionContentToks += outToks;
      _lastChatTimings._thinkToks = thkToks;
      _lastChatTimings._contentToks = outToks;

      const now = new Date().toTimeString().slice(0, 8);
      const promptPreview = text.slice(0, 40);
      const tpsVal = timings.predicted_per_second ? timings.predicted_per_second.toFixed(1) : '--';
      const ttftVal = timings.prompt_ms ? timings.prompt_ms.toFixed(0) + 'ms' : '--';
      const totalMs = (timings.prompt_ms || 0) + (timings.predicted_ms || 0);
      const totVal = totalMs > 0 ? (totalMs / 1000).toFixed(1) + 's' : '--';
      const entry = { now, prompt: promptPreview, thk: thkToks, out: outToks, tpsVal, ttftVal, totVal, source: 'chat' };
      if (typeof pushHistoryEntry === 'function') pushHistoryEntry(entry);
      else {
        reqHist.unshift(entry);
        if (reqHist.length > 20) reqHist.pop();
        localStorage.setItem('nerv-req-hist', JSON.stringify(reqHist));
        _renderHistory();
      }
      _lastHistoryWriteAt = Date.now();
      if (timings.prompt_ms > 0) ttftH.push(timings.prompt_ms);
    }
  } catch (err) {
    const cursor = document.getElementById('chat-cursor');
    if (cursor) cursor.remove();
    if (err.name === 'AbortError') {
      if (!_chatClearing) chatHistory.push({ role: 'assistant', content: fullText || '' });
    } else if (assistantEl) {
      assistantEl.textContent = '[error: ' + err.message + ']';
      assistantEl.style.color = 'var(--rd)';
    }
  }

  chatBusy = false;
  _activeInternalChat = false;
  _chatClearing = false;
  _chatAbort = null;
  sendBtn.textContent = 'send';
  sendBtn.style.color = 'var(--cy)';
  input.style.color = 'var(--fg)';
  input.focus();
}

function chatStopStream() {
  if (_chatAbort) {
    _chatAbort.abort();
    _chatAbort = null;
  }
}

document.addEventListener('keydown', (e) => {
  const inp = document.getElementById('chat-input');
  if (document.activeElement === inp) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      chatSend();
    }
  }
});

document.getElementById('chat-send').addEventListener('click', () => {
  if (chatBusy) chatStopStream();
  else chatSend();
});
