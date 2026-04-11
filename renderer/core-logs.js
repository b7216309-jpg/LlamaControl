function addLogEntry(lvl,msg){
  const c=document.getElementById('log-lines');
  const now=new Date().toTimeString().slice(0,8);
  appendLogLine(c, now, lvl, msg);
  while(c.children.length>AS.maxLogLines)c.removeChild(c.firstChild);
}

let _lastLogContent = '';
async function fetchAndDisplayLogs() {
  try {
    const raw = await window.api.getLogs(80);
    if (raw === _lastLogContent) return;
    if (raw === '(no logs)' || !raw.trim()) {
      _lastLogContent = raw;
      const c = document.getElementById('log-lines');
      if (c) clearNode(c);
      return;
    }
    const oldLines = _lastLogContent ? _lastLogContent.split('\n') : [];
    _lastLogContent = raw;
    const newLines = raw.split('\n');
    // Find where old content ends to only append new lines
    let startIdx = 0;
    if (oldLines.length > 0) {
      const lastOld = oldLines[oldLines.length - 1];
      if (lastOld) { for (let i = newLines.length - 1; i >= 0; i--) { if (newLines[i] === lastOld) { startIdx = i + 1; break; } } }
    }
    const c = document.getElementById('log-lines');
    for (let i = startIdx; i < newLines.length; i++) {
      const line = newLines[i];
      if (!line.trim()) continue;
      if (/all slots are idle|done request: GET \/(slots|health|metrics)|new request: GET \/(slots|health|metrics)|cancel task, id_task/.test(line)) continue;
      let lvl = 'INFO';
      if (/\b(error|err|fail)\b/i.test(line)) lvl = 'ERR';
      else if (/\b(warn|warning)\b/i.test(line)) lvl = 'WARN';
      else if (/\b(debug|dbg)\b/i.test(line)) lvl = 'DBG';
      const ts = line.match(/^(\d{4}[-/]\d{2}[-/]\d{2}\s+\d{2}:\d{2}:\d{2})/);
      const tsStr = ts ? ts[1] : '';
      const msg = tsStr ? line.slice(tsStr.length).trim() : line;
      appendLogLine(c, tsStr || new Date().toTimeString().slice(0,8), lvl, msg);
    }
    while(c.children.length>(AS.maxLogLines||100))c.removeChild(c.firstChild);
  } catch {}
}

// â”€â”€ CPU COMPACT TOGGLE â”€â”€
