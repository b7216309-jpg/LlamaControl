const http = require("http");

function getText(url, timeoutMs = 3000, fallback = null) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        resolve(fallback);
        return;
      }

      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => resolve(data));
    });

    req.on("error", () => resolve(fallback));
    req.on("timeout", () => {
      req.destroy();
      resolve(fallback);
    });
  });
}

async function getJson(url, timeoutMs = 3000, fallback = null) {
  const text = await getText(url, timeoutMs, null);
  if (text === null) return fallback;

  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function postRequest(options, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const req = http.request({ ...options, timeout: timeoutMs }, (res) => {
      res.resume();
      res.on("end", () => resolve(res.statusCode || 0));
    });

    req.on("error", () => resolve(0));
    req.on("timeout", () => {
      req.destroy();
      resolve(0);
    });
    req.end();
  });
}

module.exports = {
  getJson,
  getText,
  postRequest,
};
