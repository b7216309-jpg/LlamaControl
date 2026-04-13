async function loadPaths() {
  try {
    const config = await window.api.getConfig();
    document.getElementById("s-serverexe").value = config.llamaServerExe || "";
    document.getElementById("s-serverturbo").value = config.llamaServerTurboExe || "";
    document.getElementById("s-modelsdir").value = config.modelsDirectory || "";
    const p = config.profiles[config.activeProfile];
    document.getElementById("s-cudagraph").checked = p?.performance?.cudaGraphOpt || false;
    document.getElementById("s-cudafp16").checked = p?.performance?.cudaForceCublasCompute16F || false;
  } catch (e) { console.error("loadPaths:", e); }
}

async function savePaths() {
  try {
    const config = await window.api.getConfig();
    config.llamaServerExe = document.getElementById("s-serverexe").value;
    config.llamaServerTurboExe = document.getElementById("s-serverturbo").value;
    config.modelsDirectory = document.getElementById("s-modelsdir").value;
    const p = config.profiles[config.activeProfile];
    p.performance.cudaGraphOpt = document.getElementById("s-cudagraph").checked;
    p.performance.cudaForceCublasCompute16F = document.getElementById("s-cudafp16").checked;
    await window.api.saveConfig(config);
  } catch (e) { console.error("savePaths:", e); }
}

async function applyAndRestart() {
  await saveSettingsToConfig();
  await savePaths();
  showFeedback("apply-feedback", "restarting server...", "var(--am)", 0);
  await llmAction("reboot");
  showFeedback("apply-feedback", "server restarted", "var(--gr)", 3000);
}

async function updateFlags() {
  const box = document.querySelector("#box-flg .box-body");
  if (!box) return;
  const badges = buildLaunchFlagBadges(await getLaunchProfileDetails());
  clearNode(box);
  badges.forEach((b) => {
    const badge = createSpan("badge " + b.c, b.t);
    box.appendChild(badge);
  });
}
