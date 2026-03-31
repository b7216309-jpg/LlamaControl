"use strict";

const path = require("path");
const { spawn } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const electronPath = require("electron");
const timeoutMs = Number.parseInt(process.env.LLAMACTRL_SMOKE_TIMEOUT_MS || "", 10) || 25000;

const child = spawn(electronPath, ["."], {
  cwd: repoRoot,
  env: {
    ...process.env,
    LLAMACTRL_SMOKE: "1",
    LLAMACTRL_SMOKE_TIMEOUT_MS: String(timeoutMs - 5000),
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let stdout = "";
let stderr = "";
let settled = false;

function finish(code, message) {
  if (settled) return;
  settled = true;
  clearTimeout(timer);
  if (message) console.log(message);
  process.exit(code);
}

child.stdout.on("data", (chunk) => {
  const text = chunk.toString();
  stdout += text;
  process.stdout.write(text);
});

child.stderr.on("data", (chunk) => {
  const text = chunk.toString();
  stderr += text;
  process.stderr.write(text);
});

child.on("error", (err) => {
  finish(1, `SMOKE_FAIL could not launch Electron: ${err.message}`);
});

child.on("exit", (code) => {
  if (code === 0 && stdout.includes("SMOKE_OK ")) {
    finish(0, "Smoke test passed");
    return;
  }

  const details = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
  finish(1, `SMOKE_FAIL Electron exited with code ${code ?? "null"}${details ? `\n${details}` : ""}`);
});

const timer = setTimeout(() => {
  child.kill();
  const details = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
  finish(1, `SMOKE_FAIL timed out after ${timeoutMs}ms${details ? `\n${details}` : ""}`);
}, timeoutMs);
