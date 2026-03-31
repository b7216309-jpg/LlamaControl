// â”€â”€ TAB SYSTEM: CHAT / TERMINAL / WSL2 â”€â”€
const _tabs = {chat: true, term: false, wsl: false};
const _termInstances = {}; // id -> {xterm, fitAddon, started}

function readThemeVar(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function hexToRgb(hex) {
  const raw = String(hex || '').trim();
  const value = raw.startsWith('#') ? raw.slice(1) : raw;
  if (value.length === 3) {
    return value.split('').map((part) => parseInt(part + part, 16));
  }
  if (value.length === 6) {
    return [
      parseInt(value.slice(0, 2), 16),
      parseInt(value.slice(2, 4), 16),
      parseInt(value.slice(4, 6), 16),
    ];
  }
  return null;
}

function toAlphaColor(hex, alpha, fallback) {
  const rgb = hexToRgb(hex);
  if (!rgb) return fallback;
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
}

function buildTerminalTheme() {
  const bg = readThemeVar('--bg', '#0c0c0c');
  const fg = readThemeVar('--fg', '#c8c093');
  const accent = readThemeVar('--or', '#fe8019');
  const red = readThemeVar('--rd', '#fb4934');
  const green = readThemeVar('--gr', '#b8bb26');
  const yellow = readThemeVar('--am', '#fabd2f');
  const blue = readThemeVar('--bl', '#83a598');
  const magenta = readThemeVar('--vi', '#d3869b');
  const cyan = readThemeVar('--cy', '#8ec07c');
  const white = readThemeVar('--wh', '#ebdbb2');
  const brightBlack = readThemeVar('--fg3', '#49483e');

  return {
    background: bg,
    foreground: fg,
    cursor: accent,
    cursorAccent: bg,
    selectionBackground: toAlphaColor(accent, 0.25, 'rgba(254,128,25,0.25)'),
    black: bg,
    red,
    green,
    yellow,
    blue,
    magenta,
    cyan,
    white,
    brightBlack,
    brightRed: red,
    brightGreen: green,
    brightYellow: yellow,
    brightBlue: blue,
    brightMagenta: magenta,
    brightCyan: cyan,
    brightWhite: white,
  };
}

function refreshTerminalThemes() {
  const theme = buildTerminalTheme();
  Object.values(_termInstances).forEach((instance) => {
    if (!instance?.xterm) return;
    try {
      instance.xterm.options.theme = theme;
    } catch {}
  });
}

function clearTerminalModuleHistory() {
  Object.values(_termInstances).forEach((instance) => {
    if (!instance?.xterm) return;
    try {
      instance.xterm.clear();
      instance.xterm.scrollToBottom();
    } catch {}
  });
}

function fitTerminal(id, scrollToBottom = false) {
  const instance = _termInstances[id];
  if (!instance) return;
  try {
    instance.fitAddon.fit();
    window.api.ptyResize(id, instance.xterm.cols, instance.xterm.rows);
    if (scrollToBottom) instance.xterm.scrollToBottom();
  } catch {}
}

function scheduleTerminalFit(id, scrollToBottom = false) {
  [0, 50, 150].forEach(delay => {
    setTimeout(() => fitTerminal(id, scrollToBottom), delay);
  });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => fitTerminal(id, scrollToBottom)).catch(() => {});
  }
}

function switchTab(id) {
  for (const t of ['chat','term','wsl']) {
    const panel = document.getElementById('panel-'+t);
    if (t===id) {
      panel.style.display = 'flex';
    } else {
      panel.style.display = 'none';
    }
    const btn = document.getElementById('tab-'+t);
    if (btn) { btn.classList.toggle('active', t===id); if(t!==id) btn.style.color='var(--fg3)'; }
  }
  // Show/hide anchored chat input bar
  const inputBar = document.getElementById('chat-input-bar');
  if (inputBar) inputBar.style.display = id==='chat' ? 'flex' : 'none';
  // Lazy-init terminals
  if (id === 'term' && !_termInstances.term) initTerminal('term', 'powershell.exe');
  if (id === 'wsl'  && !_termInstances.wsl)  initTerminal('wsl', 'wsl.exe');
  // Fit on switch
  if (_termInstances[id]) scheduleTerminalFit(id, true);
}

async function initTerminal(id, shell) {
  if (!window.Terminal || !window.FitAddon) {
    console.error('xterm not loaded! Terminal:', typeof window.Terminal, 'FitAddon:', typeof window.FitAddon);
    const container = document.getElementById('panel-'+id);
    while (container.firstChild) container.removeChild(container.firstChild);
    const error = document.createElement('div');
    error.style.cssText = 'padding:10px;color:var(--rd);font-size:10px;';
    error.textContent = 'xterm.js failed to load';
    container.appendChild(error);
    return;
  }
  const Terminal = window.Terminal;
  const FitAddon = window.FitAddon.FitAddon;

  const term = new Terminal({
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    theme: buildTerminalTheme(),
    cursorBlink: true,
    scrollback: 5000,
  });

  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);

  const container = document.getElementById('panel-'+id);
  while (container.firstChild) container.removeChild(container.firstChild);
  const host = document.createElement('div');
  host.className = 'term-host';
  container.appendChild(host);
  term.open(host);

  _termInstances[id] = { xterm: term, fitAddon, started: true, container, host };
  scheduleTerminalFit(id, true);

  // Create PTY in main process
  const result = await window.api.ptyCreate(id, shell);
  if (!result || !result.ok) {
    term.writeln('\x1b[31mFailed to start '+shell+': '+(result?.msg||'unknown')+'\x1b[0m');
    return;
  }

  // Wire data
  term.onData(data => window.api.ptyWrite(id, data));
  term.onResize(({cols, rows}) => window.api.ptyResize(id, cols, rows));

  // Send initial size
  window.api.ptyResize(id, term.cols, term.rows);

  // Observe container resize
  const resizeObserver = new ResizeObserver(() => scheduleTerminalFit(id));
  resizeObserver.observe(container);
  resizeObserver.observe(host);
}

// Receive PTY data
window.api.onPtyData((id, data) => {
  if (_termInstances[id]) _termInstances[id].xterm.write(data);
});
window.api.onPtyExit((id) => {
  if (_termInstances[id]) {
    _termInstances[id].xterm.writeln('\r\n\x1b[33m[process exited]\x1b[0m');
  }
});

