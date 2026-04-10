const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  // Server controls
  getStatus: () => ipcRenderer.invoke("get-status"),
  start: () => ipcRenderer.invoke("start-server"),
  stop: () => ipcRenderer.invoke("stop-server"),
  reboot: () => ipcRenderer.invoke("reboot-server"),
  getLogs: (n) => ipcRenderer.invoke("get-logs", n),
  clearLogs: () => ipcRenderer.invoke("clear-logs"),

  // Server info
  getServerInfo: () => ipcRenderer.invoke("get-server-info"),

  // Config & profiles
  getConfig: () => ipcRenderer.invoke("get-config"),
  saveConfig: (cfg) => ipcRenderer.invoke("save-config", cfg),
  scanModels: () => ipcRenderer.invoke("scan-models"),
  getProfiles: () => ipcRenderer.invoke("get-profiles"),
  saveProfile: (name, profile) => ipcRenderer.invoke("save-profile", name, profile),
  deleteProfile: (name) => ipcRenderer.invoke("delete-profile", name),
  setActiveProfile: (name) => ipcRenderer.invoke("set-active-profile", name),

  // System & LLM metrics
  getSystemMetrics: () => ipcRenderer.invoke("get-system-metrics"),
  getLlmMetrics: () => ipcRenderer.invoke("get-llm-metrics"),
  getLlmSlots: () => ipcRenderer.invoke("get-llm-slots"),
  killAllSlots: () => ipcRenderer.invoke("kill-all-slots"),

  // Companion lifecycle
  startCompanion: () => ipcRenderer.invoke("start-companion"),
  stopCompanion: () => ipcRenderer.invoke("stop-companion"),

  // Process management
  killProcess: (pid) => ipcRenderer.invoke("kill-process", pid),

  // Terminal PTY
  ptyCreate: (id, shell) => ipcRenderer.invoke("pty-create", id, shell),
  ptyWrite: (id, data) => ipcRenderer.invoke("pty-write", id, data),
  ptyResize: (id, cols, rows) => ipcRenderer.invoke("pty-resize", id, cols, rows),
  ptyKill: (id) => ipcRenderer.invoke("pty-kill", id),
  onPtyData: (cb) => {
    const listener = (_, id, data) => cb(id, data);
    ipcRenderer.on("pty-data", listener);
    return () => ipcRenderer.removeListener("pty-data", listener);
  },
  onPtyExit: (cb) => {
    const listener = (_, id) => cb(id);
    ipcRenderer.on("pty-exit", listener);
    return () => ipcRenderer.removeListener("pty-exit", listener);
  },

  // Window controls (frameless window)
  minimizeWindow: () => ipcRenderer.invoke("window-minimize"),
  maximizeWindow: () => ipcRenderer.invoke("window-maximize"),
  closeWindow: () => ipcRenderer.invoke("window-close"),
  setBounds: (b) => ipcRenderer.invoke("window-set-bounds", b),
  setOnTop: (flag) => ipcRenderer.invoke("window-set-on-top", flag),
  getBounds: () => ipcRenderer.invoke("window-get-bounds"),
});
