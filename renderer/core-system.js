function renderSystemMetrics(sys) {
  if (!sys) return;

  if (!coresBuilt && Array.isArray(sys.cpu?.cores) && sys.cpu.cores.length > 0) {
    buildCores(sys.cpu.cores.length);
    coresBuilt = true;
    const title = document.getElementById('title-cpu');
    if (title && sys.cpu.brand) title.textContent = '[ CPU - ' + sys.cpu.brand + ' ]';
  }

  if (sys.disk) buildDisks(sys.disk);
  if (sys.gpu && sys.gpu.vramTotal) {
    _VMAX = sys.gpu.vramTotal;
    const title = document.getElementById('title-gpu');
    if (title && !title._set) {
      title.textContent = '[ ' + (sys.gpu.name || 'GPU') + ' ]';
      title._set = true;
    }
  }
  if (sys.mem && sys.mem.total) {
    _RMAX = sys.mem.total;
    const title = document.getElementById('title-ram');
    if (title && !title._set) {
      title.textContent = '[ ' + (sys.mem.label || 'RAM') + ' - ' + sys.mem.total.toFixed(0) + ' GB ]';
      title._set = true;
    }
  }
  if (sys.procs) renderProcs(sys.procs);

  const cpuCores = Array.isArray(sys.cpu?.cores) ? sys.cpu.cores : [];
  const avgCpu = cpuCores.length ? cpuCores.reduce((sum, core) => sum + core.pct, 0) / cpuCores.length : 0;

  peaks.cpu = Math.max(peaks.cpu, avgCpu);
  peaks.ram = Math.max(peaks.ram, Number(sys.mem?.used) || 0);
  if (sys.gpu && sys.gpu.util !== undefined) {
    peaks.gpuUtil = Math.max(peaks.gpuUtil, sys.gpu.util);
    peaks.gpuTemp = Math.max(peaks.gpuTemp, sys.gpu.temp || 0);
    peaks.gpuPow = Math.max(peaks.gpuPow, sys.gpu.power || 0);
    peaks.vram = Math.max(peaks.vram, sys.gpu.vramUsed || 0);
  }

  pushH('cpu', avgCpu);
  setT('cpu-tot', avgCpu.toFixed(0) + '%');
  setC('cpu-tot', ramp(avgCpu));
  setT('cpu-freq', sys.cpu?.freq ? sys.cpu.freq.toFixed(1) + ' GHz' : '--');
  cpuCores.forEach((core, index) => {
    setG('cr' + index, core.pct);
    const value = document.getElementById('cv' + index);
    if (!value) return;
    value.textContent = core.pct.toFixed(0) + '%';
    value.style.color = ramp(core.pct);
  });
  setSpark('sp-cpu', H.cpu, 100);
  setT('sb-cpu', avgCpu.toFixed(0) + '%');
  setC('sb-cpu', ramp(avgCpu));

  if (sys.gpu && sys.gpu.util !== undefined) {
    pushH('gpu', sys.gpu.util);
    const vramPct = _VMAX > 0 ? sys.gpu.vramUsed / _VMAX * 100 : 0;
    setG('g-gpuu', sys.gpu.util);
    setT('v-gpuu', sys.gpu.util.toFixed(0) + '%');
    setC('v-gpuu', ramp(sys.gpu.util));
    setSpark('sp-gpu', H.gpu, 100);
    setG('g-vram', vramPct);
    setT('v-vram', sys.gpu.vramUsed.toFixed(1) + 'G');
    setC('v-vram', ramp(vramPct));
    setT('v-gtem', sys.gpu.temp + ' C');
    setT('v-gpow', sys.gpu.power + ' W');
    setT('v-gclk', sys.gpu.coreClock + ' MHz');
    setT('sb-gpu', sys.gpu.util.toFixed(0) + '%');
    setC('sb-gpu', ramp(sys.gpu.util));
    setT('sb-vram', sys.gpu.vramUsed.toFixed(1) + '/' + _VMAX + 'G');
    setC('sb-vram', ramp(vramPct));
  }

  const memPct = sys.mem?.total > 0 ? sys.mem.used / sys.mem.total * 100 : 0;
  pushH('mem', memPct);
  setG('g-muse', memPct);
  setT('v-muse', sys.mem.used.toFixed(1) + 'G');
  setC('v-muse', ramp(memPct));
  setT('sb-ram', sys.mem.used.toFixed(1) + 'G');
  setC('sb-ram', ramp(memPct));

  MAX_NET = Math.max(MAX_NET, sys.net.dl * 1.5, sys.net.ul * 1.5, 1);
  setG('g-ndl', sys.net.dl / MAX_NET * 100, 'var(--gr)');
  setT('v-ndl', sys.net.dl.toFixed(2) + 'M/s');
  setG('g-nul', sys.net.ul / MAX_NET * 100, 'var(--or)');
  setT('v-nul', sys.net.ul.toFixed(2) + 'M/s');
  setT('v-nrx', sys.net.rxTotal);
  setT('v-ntx', sys.net.txTotal);
}
