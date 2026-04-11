const fs = require("fs");
const path = require("path");

function createWindowController({
  BrowserWindow,
  baseDir,
}) {
  let win = null;

  function getWindow() {
    if (!win || win.isDestroyed()) return null;
    return win;
  }

  return {
    create() {
      win = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 280,
        minHeight: 200,
        frame: false,
        icon: fs.existsSync(path.join(baseDir, "icon.png")) ? path.join(baseDir, "icon.png") : undefined,
        webPreferences: {
          preload: path.join(baseDir, "preload.js"),
          contextIsolation: true,
          nodeIntegration: false,
          webSecurity: true,
        },
      });

      win.setMenuBarVisibility(false);
      win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      win.loadFile(path.join(baseDir, "index.html"));
      return win;
    },
    getWindow,
    minimize() {
      const windowRef = getWindow();
      if (windowRef) windowRef.minimize();
    },
    maximize() {
      const windowRef = getWindow();
      if (!windowRef) return;
      if (windowRef.isMaximized()) windowRef.unmaximize();
      else windowRef.maximize();
    },
    close() {
      const windowRef = getWindow();
      if (windowRef) windowRef.close();
    },
    setBounds(bounds) {
      const windowRef = getWindow();
      if (windowRef) windowRef.setBounds(bounds);
    },
    setOnTop(flag) {
      const windowRef = getWindow();
      if (windowRef) windowRef.setAlwaysOnTop(flag, "floating");
    },
    getBounds() {
      const windowRef = getWindow();
      return windowRef ? windowRef.getBounds() : null;
    },
  };
}

module.exports = {
  createWindowController,
};
