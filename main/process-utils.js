const { exec } = require("child_process");

function killPid(pid) {
  return new Promise((resolve) => {
    if (process.platform === "win32") {
      exec(`taskkill /F /T /PID ${pid}`, { timeout: 5000 }, () => resolve());
      return;
    }

    try {
      process.kill(-pid, "SIGKILL");
    } catch {}
    resolve();
  });
}

function killByName(name) {
  return new Promise((resolve) => {
    if (process.platform === "win32") {
      exec(`taskkill /F /IM ${name}`, { timeout: 5000 }, () => resolve());
      return;
    }

    exec(`pkill -9 -f ${name}`, { timeout: 5000 }, () => resolve());
  });
}

module.exports = {
  killByName,
  killPid,
};
