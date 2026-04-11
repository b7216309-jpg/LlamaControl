function toggleAppSettings(e) {
  let pop = document.getElementById('app-settings-popup');
  if (pop) { pop.remove(); return; }
  const btn = e ? e.currentTarget || e.target : null;
  const rect = btn ? btn.getBoundingClientRect() : {left:200,bottom:22};
  pop = document.createElement('div');
  pop.id = 'app-settings-popup';
  pop.style.cssText = 'position:fixed;z-index:9999;background:var(--bg1);border:1px solid var(--bdr);font-family:var(--f);font-size:10px;width:260px;display:flex;flex-direction:column;';
  pop.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 270)) + 'px';
  pop.style.top = (rect.bottom + 4) + 'px';

  const row = (label, id, val, min, max, unit) => {
    const wrap = createDiv(undefined, 'display:flex;justify-content:space-between;align-items:center;gap:4px;');
    wrap.appendChild(createDiv(label, 'color:var(--fg2);'));
    const controls = createDiv(undefined, 'display:flex;align-items:center;gap:3px;');
    const input = document.createElement('input');
    input.type = 'number';
    input.id = id;
    input.value = val;
    input.min = min;
    input.max = max;
    input.style.cssText = 'width:48px;background:var(--bg2);color:var(--wh);border:1px solid var(--bdr);font-family:var(--f);font-size:10px;padding:1px 3px;text-align:right;';
    controls.appendChild(input);
    controls.appendChild(createDiv(unit, 'color:var(--fg3);font-size:9px;width:16px;'));
    wrap.appendChild(controls);
    return wrap;
  };

  const header = createDiv(undefined, 'padding:4px 8px;background:var(--bg);border-bottom:1px solid var(--bdr);display:flex;justify-content:space-between;align-items:center;');
  header.appendChild(createDiv('APP SETTINGS', 'color:var(--fg2);letter-spacing:2px;font-size:9px;'));
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'x';
  closeBtn.style.cssText = 'background:none;border:none;color:var(--fg3);cursor:pointer;font-family:var(--f);font-size:10px;';
  closeBtn.onclick = () => pop.remove();
  header.appendChild(closeBtn);
  pop.appendChild(header);

  const alertsSection = createDiv(undefined, 'padding:6px 8px;display:flex;flex-direction:column;gap:4px;');
  alertsSection.appendChild(createDiv('ALERT THRESHOLDS', 'font-size:9px;color:var(--fg3);letter-spacing:1px;'));
  alertsSection.appendChild(row('CPU warn', 'as-cpu', AS.alertCpu, 50, 100, '%'));
  alertsSection.appendChild(row('GPU warn', 'as-gpu', AS.alertGpu, 50, 100, '%'));
  alertsSection.appendChild(row('GPU temp', 'as-gtemp', AS.alertGpuTemp, 60, 100, 'C'));
  alertsSection.appendChild(row('VRAM warn', 'as-vram', AS.alertVram, 50, 100, '%'));
  alertsSection.appendChild(row('RAM warn', 'as-ram', AS.alertRam, 50, 100, '%'));
  pop.appendChild(alertsSection);

  const pollingSection = createDiv(undefined, 'border-top:1px solid var(--bdr);padding:6px 8px;display:flex;flex-direction:column;gap:4px;');
  pollingSection.appendChild(createDiv('POLLING', 'font-size:9px;color:var(--fg3);letter-spacing:1px;'));
  const pollRow = createDiv(undefined, 'display:flex;justify-content:space-between;align-items:center;');
  pollRow.appendChild(createDiv('Update interval', 'color:var(--fg2)'));
  const pollSelect = document.createElement('select');
  pollSelect.id = 'as-poll';
  pollSelect.style.cssText = 'background:var(--bg2);color:var(--wh);border:1px solid var(--bdr);font-family:var(--f);font-size:10px;padding:1px 3px;';
  [
    ['1000', '1s'],
    ['1500', '1.5s'],
    ['2000', '2s'],
    ['3000', '3s'],
    ['5000', '5s'],
  ].forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    option.selected = AS.pollInterval === parseInt(value, 10);
    pollSelect.appendChild(option);
  });
  pollRow.appendChild(pollSelect);
  pollingSection.appendChild(pollRow);
  pollingSection.appendChild(row('Max log lines', 'as-log', AS.maxLogLines, 5, 50, ''));
  pop.appendChild(pollingSection);

  const appearanceSection = createDiv(undefined, 'border-top:1px solid var(--bdr);padding:6px 8px;display:flex;flex-direction:column;gap:4px;');
  appearanceSection.appendChild(createDiv('APPEARANCE', 'font-size:9px;color:var(--fg3);letter-spacing:1px;'));
  const themeRow = createDiv(undefined, 'display:flex;justify-content:space-between;align-items:center;gap:8px;');
  themeRow.appendChild(createDiv('Interface color', 'color:var(--fg2)'));
  const themeSelect = document.createElement('select');
  themeSelect.id = 'as-theme';
  themeSelect.style.cssText = 'background:var(--bg2);color:var(--wh);border:1px solid var(--bdr);font-family:var(--f);font-size:10px;padding:1px 3px;min-width:108px;';
  Object.entries(UI_THEMES).forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    option.selected = AS.uiTheme === value;
    themeSelect.appendChild(option);
  });
  themeRow.appendChild(themeSelect);
  appearanceSection.appendChild(themeRow);
  pop.appendChild(appearanceSection);

  const autoSection = createDiv(undefined, 'border-top:1px solid var(--bdr);padding:6px 8px;');
  const autoLabel = document.createElement('label');
  autoLabel.style.cssText = 'display:flex;align-items:center;gap:6px;cursor:pointer;color:var(--fg2);';
  const autoInput = document.createElement('input');
  autoInput.type = 'checkbox';
  autoInput.id = 'as-autostart';
  autoInput.checked = AS.autoStartServer;
  autoInput.style.accentColor = 'var(--or)';
  autoLabel.appendChild(autoInput);
  autoLabel.appendChild(document.createTextNode('Auto-start server on launch'));
  autoSection.appendChild(autoLabel);
  pop.appendChild(autoSection);

  const footer = createDiv(undefined, 'border-top:1px solid var(--bdr);padding:4px 8px;');
  const applyBtn = document.createElement('button');
  applyBtn.id = 'as-save-btn';
  applyBtn.textContent = 'apply';
  applyBtn.style.cssText = 'width:100%;background:transparent;border:1px solid var(--or);color:var(--or);font-family:var(--f);font-size:10px;cursor:pointer;padding:3px 0;transition:all .1s;';
  footer.appendChild(applyBtn);
  pop.appendChild(footer);
  document.body.appendChild(pop);

  applyBtn.onclick = () => {
    AS.alertCpu = parseInt(document.getElementById('as-cpu').value) || 90;
    AS.alertGpu = parseInt(document.getElementById('as-gpu').value) || 95;
    AS.alertGpuTemp = parseInt(document.getElementById('as-gtemp').value) || 85;
    AS.alertVram = parseInt(document.getElementById('as-vram').value) || 90;
    AS.alertRam = parseInt(document.getElementById('as-ram').value) || 85;
    AS.maxLogLines = parseInt(document.getElementById('as-log').value) || 14;
    AS.autoStartServer = document.getElementById('as-autostart').checked;
    const newPoll = parseInt(document.getElementById('as-poll').value) || 1500;
    if (newPoll !== AS.pollInterval) {
      AS.pollInterval = newPoll;
      if (_pollTimer) clearInterval(_pollTimer);
      if (_logTimer) clearInterval(_logTimer);
      _pollTimer = setInterval(update, AS.pollInterval);
      _logTimer = setInterval(fetchAndDisplayLogs, Math.max(AS.pollInterval * 2, 3000));
    }
    AS.uiTheme = applyUiTheme(document.getElementById('as-theme').value);
    saveAS();
    pop.remove();
    addLogEntry('INFO', 'App settings updated');
  };

  setTimeout(() => document.addEventListener('click', function _h(e){ if(!pop.contains(e.target)&&!e.target.closest('.win-btn')){pop.remove();document.removeEventListener('click',_h);} }), 10);
}
