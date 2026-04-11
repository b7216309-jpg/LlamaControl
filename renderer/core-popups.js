let _cpuCompact = false;
function toggleCpuCompact() {
  _cpuCompact = !_cpuCompact;
  const det = document.getElementById('cpu-details');
  const btn = document.getElementById('cpu-toggle-btn');
  if (det) det.style.display = _cpuCompact ? 'none' : '';
  if (btn) btn.textContent = _cpuCompact ? '>' : 'v';
}

// â”€â”€ HEALTH POPUP â”€â”€
function toggleHealthPopup(e) {
  let pop = document.getElementById('health-popup');
  if (pop) { pop.remove(); return; }
  // Position above the clicked segment
  const seg = e ? e.currentTarget || e.target.closest('.sb-seg') : null;
  const rect = seg ? seg.getBoundingClientRect() : {left:200,top:0};
  pop = document.createElement('div');
  pop.id = 'health-popup';
  pop.style.cssText = 'position:fixed;z-index:9999;background:var(--bg1);border:1px solid var(--bdr);font-family:var(--f);font-size:10px;width:260px;max-height:340px;display:flex;flex-direction:column;';
  pop.style.left = rect.left + 'px';
  pop.style.bottom = (window.innerHeight - rect.top + 2) + 'px';

  const peakRows = [
    ['CPU max', peaks.cpu.toFixed(0)+'%', ramp(peaks.cpu)],
    ['GPU max', peaks.gpuUtil.toFixed(0)+'%', ramp(peaks.gpuUtil)],
    ['GPU temp max', peaks.gpuTemp+' C', peaks.gpuTemp>80?'var(--rd)':peaks.gpuTemp>65?'var(--am)':'var(--gr)'],
    ['GPU power max', peaks.gpuPow+'W', 'var(--or)'],
    ['VRAM max', peaks.vram.toFixed(1)+'G', ramp(peaks.vram/_VMAX*100)],
    ['RAM max', peaks.ram.toFixed(1)+'G', ramp(peaks.ram/_RMAX*100)],
    ['Gen t/s peak', peaks.tps>0?peaks.tps.toFixed(1):'--', 'var(--or)'],
  ];

  const header = createDiv(undefined, 'padding:4px 8px;background:var(--bg);border-bottom:1px solid var(--bdr);display:flex;justify-content:space-between;align-items:center;');
  header.appendChild(createDiv('SYSTEM HEALTH', 'color:var(--fg2);letter-spacing:2px;font-size:9px;'));
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'x';
  closeBtn.style.cssText = 'background:none;border:none;color:var(--fg3);cursor:pointer;font-family:var(--f);font-size:10px;';
  closeBtn.onclick = () => pop.remove();
  header.appendChild(closeBtn);
  pop.appendChild(header);

  const peaksWrap = createDiv(undefined, 'padding:6px 8px;display:flex;flex-direction:column;gap:2px;');
  peaksWrap.appendChild(createDiv('PEAKS (SESSION)', 'font-size:9px;color:var(--fg3);letter-spacing:1px;'));
  peakRows.forEach(([k, v, c]) => {
    const row = createDiv(undefined, 'display:flex;justify-content:space-between;');
    row.appendChild(createDiv(k, 'color:var(--fg2);'));
    row.appendChild(createDiv(v, 'color:' + c + ';font-weight:700'));
    peaksWrap.appendChild(row);
  });
  pop.appendChild(peaksWrap);

  if (alertLog.length > 0) {
    const alertsWrap = createDiv(undefined, 'border-top:1px solid var(--bdr);padding:6px 8px;flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:1px;');
    alertsWrap.appendChild(createDiv('RECENT ALERTS', 'font-size:9px;color:var(--fg3);letter-spacing:1px;'));
    alertLog.slice(0, 15).forEach((a) => {
      const col = a.level === 'crit' ? 'var(--rd)' : 'var(--am)';
      const row = createDiv(undefined, 'display:flex;gap:6px;font-size:9px;');
      row.appendChild(createDiv(a.ts, 'color:var(--fg3);'));
      row.appendChild(createDiv(a.msg, 'color:' + col));
      alertsWrap.appendChild(row);
    });
    pop.appendChild(alertsWrap);
  } else {
    pop.appendChild(createDiv('No alerts', 'border-top:1px solid var(--bdr);padding:6px 8px;font-size:9px;color:var(--fg3);'));
  }

  const footer = createDiv(undefined, 'border-top:1px solid var(--bdr);padding:4px 8px;');
  const clearBtn = document.createElement('button');
  clearBtn.textContent = 'clear alerts';
  clearBtn.style.cssText = 'width:100%;background:transparent;border:1px solid var(--bdr);color:var(--fg2);font-family:var(--f);font-size:9px;cursor:pointer;padding:2px 0;';
  clearBtn.onclick = () => {
    alertCount = 0;
    alertLog.length = 0;
    document.getElementById('alert-badge').textContent = '0';
    document.getElementById('alert-badge').className = 'alert-badge zero';
    pop.remove();
  };
  footer.appendChild(clearBtn);
  pop.appendChild(footer);
  document.body.appendChild(pop);
  // Close on outside click
  setTimeout(() => document.addEventListener('click', function _h(e){ if(!pop.contains(e.target)&&!e.target.closest('.sb-seg')){pop.remove();document.removeEventListener('click',_h);} }), 10);
}

// â”€â”€ APP SETTINGS POPUP â”€â”€
