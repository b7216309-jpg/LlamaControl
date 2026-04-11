async function fetchSys() {
  try { return await window.api.getSystemMetrics(); } catch { return null; }
}
async function fetchHealth() {
  try { return await window.api.getStatus(); } catch { return null; }
}
async function fetchMetrics() {
  try {
    const raw = await window.api.getLlmMetrics();
    if (!raw) return null;
    const toNum = (value) => {
      const num = typeof value === 'number' ? value : parseFloat(value);
      return Number.isFinite(num) ? num : 0;
    };
    // Transform Prometheus flat object to the shape update() expects
    // llama-server uses either 'llamacpp:metric' or 'llamacpp_metric' depending on version
    // Try multiple metric name variants (llama-server changed names across versions)
    const g = (...names) => {
      for (const name of names) {
        const v = raw['llamacpp:'+name] ?? raw['llamacpp_'+name] ?? raw[name];
        if (v !== undefined && v !== null) return toNum(v);
      }
      return 0;
    };
    // b8412 actual names: predicted_tokens_seconds, prompt_tokens_seconds
    const tps = g('predicted_tokens_seconds', 'tokens_predicted_seconds', 'tokens_predicted_per_second');
    const pts = g('prompt_tokens_seconds', 'prompt_tokens_per_second');
    const run = tps > 0 || g('requests_processing') > 0;
    const promptToks = g('prompt_tokens_total');
    const genToks = g('tokens_predicted_total');
    const promptSec = g('prompt_seconds_total');
    const genSec = g('tokens_predicted_seconds_total');
    const reqProc = g('requests_processing');
    const reqDef = g('requests_deferred');
    const reqFail = g('requests_errored_total', 'requests_failed_total', 'requests_error_total');
    const reqStarted = g('requests_total', 'requests_started_total', 'requests_created_total', 'requests_submitted_total');
    const reqCompleted = g('requests_completed_total', 'requests_success_total', 'requests_finished_total');
    const nDecode = g('n_decode_total');
    const reqTot = reqStarted || ((reqCompleted > 0 || reqFail > 0) ? (reqCompleted + reqFail + reqProc + reqDef) : 0);
    return {
      kv_ratio: g('kv_cache_usage_ratio'),
      kv_full: g('kv_cache_full_events'),
      req_proc: reqProc,
      req_def: reqDef,
      req_fail: reqFail,
      req_tot: reqTot,
      prompt_toks: promptToks,
      gen_toks: genToks,
      think_toks: 0,
      prefill_s: promptSec > 0 ? promptSec : (pts > 0 ? promptToks / pts : 0),
      eval_s: genSec > 0 ? genSec : (tps > 0 ? genToks / tps : 0),
      n_decode: nDecode || genToks,
      cache_hit: 0,
      _tps: tps,
      _pts: pts,
      _run: run,
    };
  } catch { return null; }
}
async function fetchSlots() {
  try { return await window.api.getLlmSlots(); } catch { return []; }
}

// â”€â”€ MAIN UPDATE â”€â”€
