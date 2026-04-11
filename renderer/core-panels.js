function alert_(boxId,msg,level='warn',key){
  const k=key||boxId+msg;
  const now=Date.now();
  if(alertDebounce[k]&&now-alertDebounce[k]<25000)return;
  alertDebounce[k]=now;
  const box=document.getElementById(boxId);
  if(box){box.classList.remove('a-warn','a-crit');void box.offsetWidth;box.classList.add(level==='crit'?'a-crit':'a-warn');}
  addLogEntry(level==='crit'?'ERR':'WARN',msg);
  alertCount++;
  alertLog.unshift({ts:new Date().toTimeString().slice(0,8),msg,level});
  if(alertLog.length>30)alertLog.pop();
  const badge=document.getElementById('alert-badge');
  if(badge){badge.textContent=alertCount;badge.className='alert-badge'+(alertCount===0?' zero':'');}
}

function checkAlerts(sys,m,sl){
  const avg=sys.cpu.cores.reduce((a,b)=>a+b.pct,0)/sys.cpu.cores.length;
  if(avg>AS.alertCpu)alert_('box-cpu','CPU avg >'+AS.alertCpu+'% ('+avg.toFixed(0)+'%)','warn','cpu-high');
  if(sys.gpu && sys.gpu.util!==undefined && sys.gpu.util>AS.alertGpu)alert_('box-gpu','GPU util >'+AS.alertGpu+'%','crit','gpu-crit');
  if(sys.gpu && sys.gpu.temp!==undefined && sys.gpu.temp>AS.alertGpuTemp)alert_('box-gpu','GPU temp >'+AS.alertGpuTemp+' C: '+sys.gpu.temp+' C','crit','gpu-temp');
  if(sys.gpu && sys.gpu.vramUsed!==undefined) {
    const vp=sys.gpu.vramUsed/_VMAX*100;
    if(vp>AS.alertVram)alert_('box-gpu','VRAM >'+AS.alertVram+'% ('+vp.toFixed(0)+'%)','warn','vram-high');
  }
  const mp=sys.mem.used/sys.mem.total*100;
  if(mp>AS.alertRam)alert_('box-mem','RAM >'+AS.alertRam+'% ('+mp.toFixed(0)+'%)','warn','mem-high');
  const kvp=m.kv_ratio*100;
  if(kvp>90)alert_('box-kvc','KV cache >90% - context near limit','crit','kv-crit');
  else if(kvp>80)alert_('box-kvc','KV cache >80% ('+kvp.toFixed(0)+'%)','warn','kv-warn');
  // Stall detection
  if(sl.state===1){
    const now=Date.now();
    if(sl.tokens_predicted!==lastTokenCount){lastTokenCount=sl.tokens_predicted;lastTokenTime=now;}
    const stall=(now-lastTokenTime)/1000;
    if(stall>180)alert_('box-slt','Slot 0 stalled: no new tokens for '+stall.toFixed(0)+'s','crit','stall');
  }else{lastTokenTime=Date.now();lastTokenCount=0;}
}

// â”€â”€ CORES â”€â”€
function buildCores(n){
  const c = document.getElementById('cores-wrap');
  clearNode(c);
  for (let i = 0; i < n; i++) {
    const row = document.createElement('div');
    row.className = 'g-row';
    row.appendChild(createSpan('g-lbl', String(i)));
    const track = document.createElement('div');
    track.className = 'g-track';
    const fill = document.createElement('div');
    fill.className = 'g-fill';
    fill.id = 'cr' + i;
    fill.style.width = '0%';
    track.appendChild(fill);
    row.appendChild(track);
    const value = createSpan('g-val', '0%');
    value.id = 'cv' + i;
    row.appendChild(value);
    c.appendChild(row);
  }
}

// â”€â”€ DISKS â”€â”€
function buildDisks(disks){
  if (!disks || !disks.length) return;
  const b = document.getElementById('disk-body');
  clearNode(b);
  disks.forEach(d => {
    const name = d.name.length > 10 ? d.name.slice(0,10) : d.name;
    const row = document.createElement('div');
    row.className = 'g-row';
    const label = document.createElement('span');
    label.className = 'g-lbl';
    label.style.cssText = 'font-size:9px;color:var(--am)';
    label.textContent = name;
    const track = document.createElement('div');
    track.className = 'g-track';
    const fill = document.createElement('div');
    fill.className = 'g-fill';
    fill.style.width = d.pct + '%';
    fill.style.background = ramp(d.pct);
    track.appendChild(fill);
    const value = document.createElement('span');
    value.className = 'g-val';
    value.style.color = 'var(--fg2)';
    value.textContent = d.used + '/' + d.total + 'G';
    row.appendChild(label);
    row.appendChild(track);
    row.appendChild(value);
    b.appendChild(row);
  });
}

// â”€â”€ PROCS â”€â”€
function renderProcs(procs) {
  if (!procs || !procs.length) return;
  const tb = document.getElementById('proc-tb');
  clearNode(tb);
  procs.forEach(p => {
    const cpuValue = p.cpu ?? p.c ?? 0;
    const cpuParsed = typeof cpuValue === 'number' ? cpuValue : parseFloat(cpuValue);
    const cpu = Number.isFinite(cpuParsed) ? cpuParsed : 0;
    const name = p.name || p.n || '';
    const user = p.user || p.u || '';
    const mem = p.mem || p.m || '';
    const tr = document.createElement('tr');
    appendCell(tr, String(p.pid), 'color:var(--fg3)');
    appendCell(tr, name, 'color:var(--am)');
    appendCell(tr, user, 'color:var(--fg2)');
    appendCell(tr, cpu.toFixed(1), 'text-align:right;color:' + ramp(cpu*2));
    appendCell(tr, mem, 'text-align:right;color:var(--bl)');
    tr.addEventListener('contextmenu', e => {
      e.preventDefault();
      e.stopPropagation();
      showProcMenu(e.clientX, e.clientY, p.pid, name);
    });
    tb.appendChild(tr);
  });
  setT('proc-cnt', procs.length + '');
}

// â”€â”€ PROCESS CONTEXT MENU â”€â”€
function showProcMenu(x, y, pid, name) {
  let menu = document.getElementById('proc-ctx-menu');
  if (!menu) {
    menu = document.createElement('div');
    menu.id = 'proc-ctx-menu';
    menu.style.cssText = 'position:fixed;z-index:9999;background:var(--bg1);border:1px solid var(--bdr);padding:2px 0;font-family:var(--f);font-size:10px;display:none;min-width:120px;';
    document.body.appendChild(menu);
    document.addEventListener('click', () => menu.style.display='none');
    document.addEventListener('contextmenu', () => menu.style.display='none');
  }
  clearNode(menu);
  menu.appendChild(createDiv('PID ' + pid + ' · ' + name, 'padding:3px 10px;color:var(--fg3);font-size:9px;user-select:none;'));
  menu.appendChild(createDiv(undefined, 'border-top:1px solid var(--bdr);margin:2px 0;'));
  const killBtn = createDiv('Kill process', 'padding:3px 10px;color:var(--rd);cursor:pointer;user-select:none;');
  killBtn.id = 'proc-kill-btn';
  menu.appendChild(killBtn);
  menu.style.left = x+'px';
  menu.style.top = y+'px';
  menu.style.display = 'block';
  killBtn.onclick = async (e) => {
    e.stopPropagation();
    menu.style.display = 'none';
    const r = await window.api.killProcess(pid);
  addLogEntry(r.ok?'INFO':'ERR', (r.ok?'Killed':'Failed to kill')+' PID '+pid+' ('+name+')');
  };
}

// â”€â”€ IPC FETCHERS â”€â”€
