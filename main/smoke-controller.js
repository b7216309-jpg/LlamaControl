const fs = require("fs");
const os = require("os");
const path = require("path");

function createSmokeController({
  app,
  smokeMode,
  smokeTimeoutMs,
}) {
  let smokeUserDataDir = null;

  function prepareUserData() {
    if (!smokeMode || smokeUserDataDir) return;
    smokeUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "llamacontrol-smoke-"));
    app.setPath("userData", smokeUserDataDir);
  }

  function cleanupUserData() {
    if (!smokeUserDataDir) return;
    try {
      fs.rmSync(smokeUserDataDir, { recursive: true, force: true });
    } catch {}
    smokeUserDataDir = null;
  }

  async function collectSmokeSummary(win) {
    return win.webContents.executeJavaScript(`
      new Promise((resolve) => {
        setTimeout(() => {
          const requiredIds = ["app", "tb-status", "chat-input", "sb-llm"];
          const rendererScripts = Array.from(document.querySelectorAll('script[src^="renderer/"]')).map((node) => node.getAttribute("src"));
          const apiMethods = [
            "getStatus",
            "start",
            "stop",
            "reboot",
            "getServerInfo",
            "getLogs",
            "clearLogs",
            "getSystemMetrics",
            "getLlmMetrics",
            "getLlmSlots"
          ];
          resolve({
            title: document.title,
            missingIds: requiredIds.filter((id) => !document.getElementById(id)),
            rendererScripts,
            missingApiMethods: apiMethods.filter((name) => typeof window.api?.[name] !== "function"),
            statusText: document.getElementById("tb-status")?.textContent?.trim() || "",
            hasClearAllHistories: typeof clearAllHistories === "function",
            hasInitPorts: typeof initPorts === "function",
          });
        }, 400);
      });
    `, true);
  }

  function installHooks(win) {
    if (!smokeMode) return;

    let finished = false;
    const finish = (code, message) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      const writer = code === 0 ? console.log : console.error;
      writer(message);
      setTimeout(() => app.exit(code), 0);
    };

    const timeout = setTimeout(() => {
      finish(1, `SMOKE_FAIL timeout after ${smokeTimeoutMs}ms`);
    }, smokeTimeoutMs);

    win.webContents.once("did-fail-load", (event, errorCode, errorDescription) => {
      finish(1, `SMOKE_FAIL load ${errorCode} ${errorDescription}`);
    });

    win.webContents.once("render-process-gone", (event, details) => {
      finish(1, `SMOKE_FAIL renderer ${details.reason}`);
    });

    win.webContents.once("did-finish-load", async () => {
      try {
        const summary = await collectSmokeSummary(win);
        if (summary.missingIds.length) throw new Error(`missing DOM nodes: ${summary.missingIds.join(", ")}`);
        if (summary.missingApiMethods.length) throw new Error(`missing preload APIs: ${summary.missingApiMethods.join(", ")}`);
        if (!summary.hasClearAllHistories) throw new Error("clearAllHistories is not available");
        if (!summary.hasInitPorts) throw new Error("initPorts is not available");
        if (summary.rendererScripts.length < 5) throw new Error("renderer scripts did not load");
        finish(0, `SMOKE_OK ${JSON.stringify(summary)}`);
      } catch (error) {
        finish(1, `SMOKE_FAIL ${error && error.stack ? error.stack : error}`);
      }
    });
  }

  return {
    cleanupUserData,
    installHooks,
    prepareUserData,
  };
}

module.exports = {
  createSmokeController,
};
