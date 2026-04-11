"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const ignoredDirs = new Set([".git", "__pycache__", "node_modules"]);
let failed = false;

function fail(message) {
  failed = true;
  console.error(`FAIL ${message}`);
}

function pass(message) {
  console.log(`OK   ${message}`);
}

function walkFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, files);
      continue;
    }
    files.push(fullPath);
  }
  return files;
}

function rel(filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/g, "/");
}

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function requireFile(relativePath) {
  const fullPath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(fullPath)) {
    fail(`missing required file ${relativePath}`);
    return false;
  }
  pass(`found ${relativePath}`);
  return true;
}

function syntaxCheck(relativePath) {
  const fullPath = path.join(repoRoot, relativePath);
  const result = spawnSync(process.execPath, ["--check", fullPath], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    fail(`syntax check failed for ${relativePath}\n${(result.stderr || result.stdout || "").trim()}`);
    return;
  }

  pass(`syntax ${relativePath}`);
}

function extractMatches(text, regex) {
  return Array.from(text.matchAll(regex), (match) => match[1]);
}

requireFile("package.json");
requireFile("index.html");
requireFile("main.js");
requireFile("preload.js");

const repoFiles = walkFiles(repoRoot).map(rel).sort();
const jsFiles = repoFiles.filter((file) => file.endsWith(".js"));
const jsSourceText = jsFiles.map((file) => readRepoFile(file)).join("\n");

for (const file of jsFiles) {
  syntaxCheck(file);
}

const packageJson = JSON.parse(readRepoFile("package.json"));
if (typeof packageJson.main !== "string" || !packageJson.main) {
  fail("package.json is missing a main entry");
} else if (fs.existsSync(path.join(repoRoot, packageJson.main))) {
  pass(`package main ${packageJson.main}`);
} else {
  fail(`package main ${packageJson.main} does not exist`);
}

for (const scriptName of ["check", "smoke", "verify"]) {
  if (typeof packageJson.scripts?.[scriptName] === "string") {
    pass(`package script ${scriptName}`);
  } else {
    fail(`package script ${scriptName} is missing`);
  }
}

const indexHtml = readRepoFile("index.html");
const scriptSources = extractMatches(indexHtml, /<script\s+src="([^"]+)"/g);
const rendererScripts = scriptSources.filter((src) => src.startsWith("renderer/"));
if (!rendererScripts.length) {
  fail("index.html does not include any renderer scripts");
}
for (const scriptSrc of rendererScripts) {
  if (fs.existsSync(path.join(repoRoot, scriptSrc))) {
    pass(`renderer script ${scriptSrc}`);
  } else {
    fail(`missing renderer script ${scriptSrc}`);
  }
}

const preloadJs = readRepoFile("preload.js");
const invokeChannels = extractMatches(preloadJs, /ipcRenderer\.invoke\("([^"]+)"/g);
const handledChannels = new Set(extractMatches(jsSourceText, /ipcMain\.handle\("([^"]+)"/g));

for (const channel of invokeChannels) {
  if (handledChannels.has(channel)) {
    pass(`IPC handle ${channel}`);
  } else {
    fail(`missing ipcMain.handle("${channel}")`);
  }
}

const listenChannels = extractMatches(preloadJs, /ipcRenderer\.on\("([^"]+)"/g);
for (const channel of listenChannels) {
  if (jsSourceText.includes(`"${channel}"`) || jsSourceText.includes(`'${channel}'`)) {
    pass(`IPC event ${channel}`);
  } else {
    fail(`missing main-process usage for event channel ${channel}`);
  }
}

if (failed) {
  console.error("CHECKS FAILED");
  process.exit(1);
}

console.log("ALL CHECKS PASSED");
