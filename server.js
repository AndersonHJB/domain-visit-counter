const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 8787;

const DATA_FILE = path.join(__dirname, "data.json");
const CONFIG_FILE = path.join(__dirname, "config.json");
const PUBLIC_DIR = path.join(__dirname, "public");

/* ------------------ 工具 ------------------ */

let writing = Promise.resolve();
function withLock(fn) {
  writing = writing.then(fn, fn);
  return writing;
}

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf8").trim();
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(filePath, obj) {
  const tmp = filePath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf8");
  fs.renameSync(tmp, filePath);
}

function loadConfig() {
  const cfg = readJsonSafe(CONFIG_FILE, {
    allowAll: true,
    allowedRootDomains: [],
    anonymizeIp: false,
  });
  cfg.allowAll = !!cfg.allowAll;
  cfg.allowedRootDomains = (cfg.allowedRootDomains || [])
    .map(s => String(s).toLowerCase().trim())
    .filter(Boolean);
  cfg.anonymizeIp = !!cfg.anonymizeIp;
  return cfg;
}

/* ------------------ 校验 ------------------ */

function sanitizeDomain(s) {
  if (!s) return "";
  s = String(s).toLowerCase().trim();
  if (!/^[a-z0-9.-]{1,253}$/.test(s)) return "";
  return s;
}

function sanitizeProject(s) {
  if (!s) return "";
  s = String(s).toLowerCase().trim();
  if (!/^[a-z0-9-_]{1,64}$/.test(s)) return "";
  return s;
}

/* ------------------ IP ------------------ */

function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff) {
    const first = String(xff).split(",")[0].trim();
    if (first) return first;
  }
  return req.headers["x-real-ip"] || req.socket?.remoteAddress || "";
}

function anonymizeIp(ip) {
  if (!ip) return "";
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
    const p = ip.split(".");
    return `${p[0]}.${p[1]}.${p[2]}.0/24`;
  }
  if (ip.includes(":")) {
    return ip.split(":").slice(0, 4).join(":") + "::/64";
  }
  return ip;
}

/* ------------------ 域名白名单 ------------------ */

function isAllowedDomain(domain, cfg) {
  if (cfg.allowAll) return true;
  return cfg.allowedRootDomains.some(
    root => domain === root || domain.endsWith("." + root)
  );
}

/* ------------------ CORS ------------------ */

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use("/public", express.static(PUBLIC_DIR, { maxAge: "1h" }));
app.get("/counter.js", (req, res) =>
  res.sendFile(path.join(PUBLIC_DIR, "counter.js"))
);

/* ------------------ 数据 ------------------ */

function readData() {
  return readJsonSafe(DATA_FILE, { version: 2, domains: {} });
}

function writeData(data) {
  writeJsonAtomic(DATA_FILE, data);
}

/* ------------------ HIT ------------------ */

function hitHandler(req, res) {
  const cfg = loadConfig();

  const domain = sanitizeDomain(req.query.d);
  const project = sanitizeProject(req.query.p);

  if (!domain) {
    return res.status(400).json({ ok: false, msg: "invalid_domain" });
  }

  if (!isAllowedDomain(domain, cfg)) {
    return res.status(403).json({ ok: false, msg: "domain_not_allowed" });
  }

  const now = Date.now();
  const rawIp = getClientIp(req);
  const ip = cfg.anonymizeIp ? anonymizeIp(rawIp) : rawIp;

  withLock(() => {
    const db = readData();

    if (!db.domains[domain]) {
      db.domains[domain] = {
        total: 0,
        last: 0,
        ips: {},
        projects: {}
      };
    }

    const d = db.domains[domain];

    // 🔥 关键兜底：兼容旧数据
    if (!d.ips || typeof d.ips !== "object") d.ips = {};
    if (!d.projects || typeof d.projects !== "object") d.projects = {};

    d.total += 1;
    d.last = now;

    if (project) {
      if (!d.projects[project]) {
        d.projects[project] = { total: 0, last: 0 };
      }
      d.projects[project].total += 1;
      d.projects[project].last = now;
    }

    if (ip) {
      if (!d.ips[ip]) d.ips[ip] = { count: 0, first: now, last: now };
      d.ips[ip].count += 1;
      d.ips[ip].last = now;
    }

    writeData(db);
  });

  res.status(204).end();
}

app.get("/hit", hitHandler);
app.post("/hit", hitHandler);

/* ------------------ STATS ------------------ */

app.get("/stats", (req, res) => {
  const cfg = loadConfig();

  const domain = sanitizeDomain(req.query.d);
  const project = sanitizeProject(req.query.p);

  if (!domain) {
    return res.status(400).json({ ok: false, msg: "invalid_domain" });
  }

  if (!isAllowedDomain(domain, cfg)) {
    return res.status(403).json({ ok: false, msg: "domain_not_allowed" });
  }

  const db = readData();
  const d = db.domains[domain] || { total: 0, last: 0, projects: {} };

  // 🔥 兜底
  if (!d.projects || typeof d.projects !== "object") d.projects = {};

  if (project) {
    const p = d.projects[project] || { total: 0, last: 0 };
    return res.json({
      ok: true,
      domain,
      project,
      total: p.total,
      last: p.last
    });
  }

  res.json({
    ok: true,
    domain,
    total: d.total,
    last: d.last
  });
});

/* ------------------ START ------------------ */

app.listen(PORT, () => {
  console.log(`Counter server running at http://127.0.0.1:${PORT}`);
});