const os = require("os");

function createTerminalManager({
  getWindow,
  pty,
  spawn,
}) {
  const terminals = {};

  function send(channel, ...args) {
    const win = getWindow();
    if (win) win.webContents.send(channel, ...args);
  }

  function getDefaultShell(shellCmd) {
    if (shellCmd) return shellCmd;
    return process.platform === "win32" ? "powershell.exe" : "bash";
  }

  return {
    create(id, shellCmd) {
      if (terminals[id]) return { ok: true, msg: "already exists" };
      const shell = getDefaultShell(shellCmd);

      if (pty) {
        try {
          const term = pty.spawn(shell, [], {
            name: "xterm-256color",
            cols: 120,
            rows: 30,
            cwd: os.homedir(),
            env: process.env,
          });
          terminals[id] = { type: "pty", handle: term };
          term.onData((data) => send("pty-data", id, data));
          term.onExit(() => {
            delete terminals[id];
            send("pty-exit", id);
          });
          return { ok: true, mode: "pty" };
        } catch {}
      }

      try {
        const child = spawn(shell, [], {
          cwd: os.homedir(),
          env: { ...process.env, TERM: "xterm-256color" },
          stdio: ["pipe", "pipe", "pipe"],
          windowsHide: true,
        });
        terminals[id] = { type: "proc", handle: child };
        child.stdout.on("data", (data) => send("pty-data", id, data.toString()));
        child.stderr.on("data", (data) => send("pty-data", id, data.toString()));
        child.on("exit", () => {
          delete terminals[id];
          send("pty-exit", id);
        });
        return { ok: true, mode: "spawn" };
      } catch (error) {
        return { ok: false, msg: error.message };
      }
    },
    write(id, data) {
      const terminal = terminals[id];
      if (!terminal) return;
      if (terminal.type === "pty") terminal.handle.write(data);
      else terminal.handle.stdin.write(data);
    },
    resize(id, cols, rows) {
      const terminal = terminals[id];
      if (terminal && terminal.type === "pty") terminal.handle.resize(cols, rows);
    },
    kill(id) {
      const terminal = terminals[id];
      if (!terminal) return;
      terminal.handle.kill();
      delete terminals[id];
    },
    killAll() {
      for (const [id, terminal] of Object.entries(terminals)) {
        try {
          terminal.handle.kill();
        } catch {}
        delete terminals[id];
      }
    },
  };
}

module.exports = {
  createTerminalManager,
};
