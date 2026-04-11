// â”€â”€ TAB SYSTEM: CHAT / TERMINAL / WSL2 â”€â”€
const _termInstances = {}; // id -> {xterm, fitAddon}

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

