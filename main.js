const { app, BrowserWindow, ipcMain } = require("electron");
const { spawn } = require("child_process");
const os = require("os");
const path = require("path");

let pty;
try {
  pty = require("node-pty");
} catch {
  pty = null;
}

const { createCompanionManager } = require("./main/companion-manager");
const { createConfigStore } = require("./main/config-store");
const { getJson, getText, postRequest } = require("./main/http-utils");
const { killByName, killPid } = require("./main/process-utils");
const { registerIpcHandlers } = require("./main/register-ipc");
const { createServerManager } = require("./main/server-manager");
const { createSmokeController } = require("./main/smoke-controller");
const { createTerminalManager } = require("./main/terminal-manager");
const { createWindowController } = require("./main/window-controller");

const BASE_DIR = __dirname;
const LOG_FILE = path.join(os.tmpdir(), "llama-server.log");
const SMOKE_MODE = process.env.LLAMACTRL_SMOKE === "1";
const SMOKE_TIMEOUT_MS = Number.parseInt(process.env.LLAMACTRL_SMOKE_TIMEOUT_MS || "", 10) || 15000;

const smokeController = createSmokeController({
  app,
  smokeMode: SMOKE_MODE,
  smokeTimeoutMs: SMOKE_TIMEOUT_MS,
});
const configStore = createConfigStore();
const windowController = createWindowController({
  BrowserWindow,
  baseDir: BASE_DIR,
});
const companionManager = createCompanionManager({
  baseDir: BASE_DIR,
  getJson,
  getText,
  killPid,
  smokeMode: SMOKE_MODE,
  spawn,
});
const serverManager = createServerManager({
  configStore,
  getJson,
  getText,
  killByName,
  killPid,
  logFile: LOG_FILE,
  postRequest,
  spawn,
});
const terminalManager = createTerminalManager({
  getWindow: windowController.getWindow,
  pty,
  spawn,
});

function registerAppIpc() {
  registerIpcHandlers({
    companionManager,
    configStore,
    ipcMain,
    serverManager,
    terminalManager,
    windowController,
  });
}

async function stopBackgroundServices() {
  terminalManager.killAll();
  await companionManager.stop();
}

app.whenReady().then(async () => {
  smokeController.prepareUserData();
  configStore.setConfigPath(path.join(app.getPath("userData"), "config.json"));
  configStore.load();
  registerAppIpc();

  const win = windowController.create();
  smokeController.installHooks(win);

  if (!SMOKE_MODE) {
    await companionManager.start();
  }
});

app.on("window-all-closed", async () => {
  await stopBackgroundServices();
  app.quit();
});

app.on("before-quit", async () => {
  await stopBackgroundServices();
});

app.on("will-quit", () => {
  smokeController.cleanupUserData();
});
