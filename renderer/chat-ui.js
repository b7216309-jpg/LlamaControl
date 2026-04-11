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
  if (btn) {
    btn.textContent = _thinkHidden ? 'think:off' : 'think:on';
    btn.style.color = _thinkHidden ? 'var(--fg3)' : 'var(--am)';
  }
  document.querySelectorAll('#chat-msgs .chat-msg.thinking').forEach((el) => {
    el.style.display = _thinkHidden ? 'none' : '';
  });
}

function chatAddMsg(role, text, streaming) {
  const msgs = document.getElementById('chat-msgs');
  const wasAtBottom = (msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight) <= 32;
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
  if (role === 'user' || wasAtBottom) msgs.scrollTop = msgs.scrollHeight;
  return textEl;
}

function clearChatModuleHistory() {
  _chatClearing = !!(chatBusy && _chatAbort);
  if (chatBusy && _chatAbort) {
    try { _chatAbort.abort(); } catch {}
  }
  chatHistory.length = 0;
  chatBusy = false;
  _chatAbort = null;
  _lastChatTimings = null;
  _sessionThinkToks = 0;
  _sessionContentToks = 0;
  _slotThinkAccum = 0;
  _prevSlotThink = 0;
  _activeInternalChat = false;
  _lastHistoryWriteAt = 0;

  const msgs = document.getElementById('chat-msgs');
  if (msgs) clearNode(msgs);
  const input = document.getElementById('chat-input');
  if (input) {
    input.value = '';
    input.style.color = 'var(--fg)';
  }
  const sendBtn = document.getElementById('chat-send');
  if (sendBtn) {
    sendBtn.textContent = 'send';
    sendBtn.style.color = 'var(--cy)';
  }
  if (!_chatClearing) _chatClearing = false;
}
