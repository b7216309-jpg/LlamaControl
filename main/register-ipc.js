function registerIpcHandlers({
  companionManager,
  configStore,
  ipcMain,
  serverManager,
  terminalManager,
  windowController,
}) {
  ipcMain.handle("get-status", () => serverManager.getStatus());
  ipcMain.handle("start-server", () => serverManager.start());
  ipcMain.handle("stop-server", () => serverManager.stop());
  ipcMain.handle("reboot-server", () => serverManager.reboot());
  ipcMain.handle("get-logs", (_, lineCount) => serverManager.getLogs(lineCount));
  ipcMain.handle("clear-logs", () => serverManager.clearLogs());

  ipcMain.handle("get-server-info", () => serverManager.getServerInfo());
  ipcMain.handle("get-system-metrics", () => companionManager.getSystemMetrics());
  ipcMain.handle("get-llm-metrics", () => serverManager.getLlmMetrics());
  ipcMain.handle("get-llm-slots", () => serverManager.getLlmSlots());
  ipcMain.handle("kill-all-slots", () => serverManager.killAllSlots());

  ipcMain.handle("start-companion", async () => {
    await companionManager.start();
    return { ok: true };
  });
  ipcMain.handle("stop-companion", async () => {
    await companionManager.stop();
    return { ok: true };
  });

  ipcMain.handle("get-config", () => configStore.getConfig());
  ipcMain.handle("save-config", (_, newConfig) => {
    configStore.save(newConfig);
    return { ok: true };
  });
  ipcMain.handle("scan-models", () => configStore.scanModels());
  ipcMain.handle("get-profiles", () => configStore.getProfiles());
  ipcMain.handle("save-profile", (_, name, profile) => {
    configStore.saveProfile(name, profile);
    return { ok: true };
  });
  ipcMain.handle("delete-profile", (_, name) => configStore.deleteProfile(name));
  ipcMain.handle("set-active-profile", (_, name) => configStore.setActiveProfile(name));

  ipcMain.handle("kill-process", (_, pid) => {
    const parsedPid = parseInt(pid, 10);
    if (Number.isNaN(parsedPid) || parsedPid <= 0) {
      return { ok: false, msg: "invalid pid" };
    }

    try {
      process.kill(parsedPid, "SIGKILL");
      return { ok: true, msg: "killed" };
    } catch (error) {
      return { ok: false, msg: error.message };
    }
  });

  ipcMain.handle("pty-create", (_, id, shellCmd) => terminalManager.create(id, shellCmd));
  ipcMain.handle("pty-write", (_, id, data) => terminalManager.write(id, data));
  ipcMain.handle("pty-resize", (_, id, cols, rows) => terminalManager.resize(id, cols, rows));
  ipcMain.handle("pty-kill", (_, id) => terminalManager.kill(id));

  ipcMain.handle("window-minimize", () => windowController.minimize());
  ipcMain.handle("window-maximize", () => windowController.maximize());
  ipcMain.handle("window-close", () => windowController.close());
  ipcMain.handle("window-set-bounds", (_, bounds) => windowController.setBounds(bounds));
  ipcMain.handle("window-set-on-top", (_, flag) => windowController.setOnTop(flag));
  ipcMain.handle("window-get-bounds", () => windowController.getBounds());
}

module.exports = {
  registerIpcHandlers,
};
