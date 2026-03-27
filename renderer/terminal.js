// â”€â”€ TAB SYSTEM: CHAT / TERMINAL / WSL2 â”€â”€
const _tabs = {chat: true, term: false, wsl: false};
const _termInstances = {}; // id -> {xterm, fitAddon, started}

function switchTab(id) {
  for (const t of ['chat','term','wsl']) {
    const panel = document.getElementById('panel-'+t);
    if (t===id) {
      panel.style.display = t==='chat' ? 'flex' : 'block';
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
  if (_termInstances[id]) setTimeout(() => _termInstances[id].fitAddon.fit(), 50);
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
    theme: {
      background: '#0c0c0c',
      foreground: '#c8c093',
      cursor: '#fe8019',
      cursorAccent: '#0c0c0c',
      selectionBackground: 'rgba(254,128,25,0.25)',
      black: '#0c0c0c', red: '#fb4934', green: '#b8bb26', yellow: '#fabd2f',
      blue: '#83a598', magenta: '#d3869b', cyan: '#8ec07c', white: '#ebdbb2',
      brightBlack: '#49483e', brightRed: '#fb4934', brightGreen: '#b8bb26', brightYellow: '#fabd2f',
      brightBlue: '#83a598', brightMagenta: '#d3869b', brightCyan: '#8ec07c', brightWhite: '#ebdbb2',
    },
    cursorBlink: true,
    scrollback: 5000,
  });

  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);

  const container = document.getElementById('panel-'+id);
  term.open(container);
  fitAddon.fit();

  _termInstances[id] = { xterm: term, fitAddon, started: true };

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
  new ResizeObserver(() => { try { fitAddon.fit(); } catch {} }).observe(container);
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

