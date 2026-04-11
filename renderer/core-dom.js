function ramp(p) {
  p = Math.max(0, Math.min(100, p));
  if (p <= 60) {
    const t = p / 60;
    return `rgb(${Math.round(184 + (250 - 184) * t)},${Math.round(187 + (189 - 187) * t)},${Math.round(38 + (47 - 38) * t)})`;
  }
  if (p <= 85) {
    const t = (p - 60) / 25;
    return `rgb(${Math.round(250 + (251 - 250) * t)},${Math.round(189 + (73 - 189) * t)},${Math.round(47 + (52 - 47) * t)})`;
  }
  const t = Math.min(1, (p - 85) / 15);
  return `rgb(251,${Math.round(73 * (1 - t * 0.5))},${Math.round(52 * (1 - t * 0.4))})`;
}

function spark(arr, max) {
  if (!arr.length) return '';
  const mx = max || Math.max(1, ...arr);
  return arr.map((value) => ' .:-=+*#'[Math.min(7, Math.floor(value / mx * 8))]).join('');
}

function setG(id, pct, color) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.width = Math.min(100, Math.max(0, pct)) + '%';
  el.style.background = color || ramp(pct);
}

function clearNode(el) {
  while (el && el.firstChild) el.removeChild(el.firstChild);
}

function appendCell(row, text, style) {
  const cell = document.createElement('td');
  if (style) cell.style.cssText = style;
  cell.textContent = text;
  row.appendChild(cell);
  return cell;
}

function createSpan(className, text) {
  const span = document.createElement('span');
  if (className) span.className = className;
  span.textContent = text;
  return span;
}

function createDiv(text, style, className) {
  const div = document.createElement('div');
  if (className) div.className = className;
  if (style) div.style.cssText = style;
  if (text !== undefined) div.textContent = text;
  return div;
}

function isNearBottom(el, px = 24) {
  return (el.scrollHeight - el.scrollTop - el.clientHeight) <= px;
}

function stickScrollBottom(el) {
  el.scrollTop = el.scrollHeight;
}

function appendLogLine(container, ts, lvl, msg) {
  const atBottom = isNearBottom(container);
  const line = document.createElement('div');
  line.className = 'log-line';
  line.appendChild(createSpan('log-ts', ts));
  line.appendChild(createSpan('log-lvl lvl-' + lvl, '[' + lvl + ']'));
  line.appendChild(createSpan('log-msg new', msg));
  container.appendChild(line);
  if (atBottom) stickScrollBottom(container);
  setTimeout(() => {
    const msgEl = line.querySelector('.log-msg');
    if (msgEl) msgEl.classList.remove('new');
  }, 900);
  return line;
}

function setT(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function setC(id, color) {
  const el = document.getElementById(id);
  if (el) el.style.color = color;
}

function setSpark(id, arr, max) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = spark(arr, max);
  el.style.color = ramp(arr.length ? arr[arr.length - 1] / max * 100 : 0);
}

function fmtTok(n) {
  if (!n || n <= 0) return '--';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(Math.round(n));
}
