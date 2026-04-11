const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const CREATE_NO_WINDOW = 0x08000000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createCompanionManager({
  baseDir,
  getJson,
  getText,
  killPid,
  smokeMode,
  spawn,
}) {
  let companionProcess = null;

  function getWindowsCompanionCommand(scriptPath) {
    try {
      const probe = spawnSync("py", ["-3", "-c", "import sys; print(sys.executable)"], {
        encoding: "utf8",
        windowsHide: true,
        creationFlags: CREATE_NO_WINDOW,
      });
      const pythonExe = (probe.stdout || "").trim().split(/\r?\n/).pop();
      if (pythonExe) {
        const pythonwExe = path.join(path.dirname(pythonExe.trim()), "pythonw.exe");
        if (fs.existsSync(pythonwExe)) return [pythonwExe, [scriptPath]];
      }
    } catch {}

    return ["py", ["-3", scriptPath]];
  }

  async function pingCompanion() {
    return (await getText("http://127.0.0.1:8765", 800, null)) !== null;
  }

  return {
    async start() {
      if (smokeMode || companionProcess) return;
      if (await pingCompanion()) return;

      const scriptPath = path.join(baseDir, "companion.py");
      const [command, args] = process.platform === "win32"
        ? getWindowsCompanionCommand(scriptPath)
        : ["python3", [scriptPath]];

      try {
        const child = spawn(command, args, {
          detached: true,
          stdio: "ignore",
          windowsHide: true,
          ...(process.platform === "win32" ? { creationFlags: CREATE_NO_WINDOW } : {}),
        });
        child.once("exit", () => {
          if (companionProcess === child) companionProcess = null;
        });
        child.unref();
        companionProcess = child;
      } catch {
        companionProcess = null;
        return;
      }

      for (let attempt = 0; attempt < 20; attempt += 1) {
        await sleep(200);
        if (await pingCompanion()) return;
      }
    },
    async stop() {
      if (companionProcess && companionProcess.pid) {
        await killPid(companionProcess.pid);
        companionProcess = null;
      }
    },
    async getSystemMetrics() {
      return getJson("http://127.0.0.1:8765", 5000, null);
    },
  };
}

module.exports = {
  createCompanionManager,
};
