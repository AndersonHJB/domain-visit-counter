const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 8787;

const DATA_FILE = path.join(__dirname, "data.json");
const CONFIG_FILE = path.join(__dirname, "config.json");
const PUBLIC_DIR = path.join(__dirname, "public");

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
  cfg.allowedRootDomains = Array.isArray(cfg.allowedRootDomains) ? cfg.allowedRootDomains : [];
  cfg.allowedRootDomains = cfg.allowedRootDomains
    .map(s => String(s).toLowerCase().trim())
    .filter(Boolean);
  cfg.anonymizeIp = !!cfg.anonymizeIp;
  return cfg;
}

// 只允许域名字符
function sanitizeDomain(s) {
  if (!s) return "";
  s = String(s).toLowerCase().trim();
  if (!/^[a-z0-9.-]{1,253}$/.test(s)) return "";
  return s;
}

// 从 Nginx 反代拿真实 IP：优先 X-Forwarded-For
function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff) {
    // 可能是 "client, proxy1, proxy2"
    const first = String(xff).split(",")[0].trim();
    if (first) return first;
  }
  const realIp = req.headers["x-real-ip"];
  if (realIp) return String(realIp).trim();
  return req.socket?.remoteAddress || "";
}

// 可选：IP 脱敏（IPv4 -> /24，IPv6 -> 截断）
function anonymizeIp(ip) {
  if (!ip) return "";
  // IPv4
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    const parts = ip.split(".");
    return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  }
  // IPv6 简单截断
  if (ip.includes(":")) {
    return ip.split(":").slice(0, 4).join(":") + "::/64";
  }
  return ip;
}

// 判断是否允许 domain（按根域名）
function isAllowedDomain(domain, cfg) {
  if (cfg.allowAll) return true;
  if (!domain) return false;
  // 允许 root 本身或其子域名：xxx.root
  return cfg.allowedRootDomains.some(root =>
    domain === root || domain.endsWith("." + root)
  );
}

// 允许跨域（前端 fetch stats / hit）
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use("/public", express.static(PUBLIC_DIR, { maxAge: "1h" }));
app.get("/counter.js", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "counter.js")));

function readData() {
  return readJsonSafe(DATA_FILE, { version: 1, domains: {} });
}

function writeData(data) {
  writeJsonAtomic(DATA_FILE, data);
}

// 计数逻辑（GET/POST 都走它）
function hitHandler(req, res) {
  const cfg = loadConfig();

  const d = sanitizeDomain(req.query.d);
  if (!d) return res.status(400).json({ ok: false, error: "invalid domain" });

  if (!isAllowedDomain(d, cfg)) {
    return res.status(403).json({ ok: false, error: "domain_not_allowed" });
  }

  const rawIp = getClientIp(req);
  const ip = cfg.anonymizeIp ? anonymizeIp(rawIp) : rawIp;

  withLock(() => {
    const db = readData();
    if (!db.domains[d]) db.domains[d] = { total: 0, last: 0, ips: {} };

    const now = Date.now();
    const item = db.domains[d];
    item.total += 1;
    item.last = now;

    if (ip) {
      if (!item.ips[ip]) item.ips[ip] = { count: 0, first: now, last: now };
      item.ips[ip].count += 1;
      item.ips[ip].last = now;
    }

    writeData(db);
  });

  // sendBeacon 不关心响应体
  res.status(204).end();
}

app.get("/hit", hitHandler);
app.post("/hit", hitHandler);

// 查询：可选 includeIps=1 返回 ip 统计；默认不返回 ip（更安全、更轻）
app.get("/stats", (req, res) => {
  const cfg = loadConfig();

  const d = sanitizeDomain(req.query.d);
  if (!d) return res.status(400).json({ ok: false, error: "invalid domain" });

  if (!isAllowedDomain(d, cfg)) {
    return res.status(403).json({ ok: false, error: "domain_not_allowed" });
  }

  const includeIps = String(req.query.includeIps || "") === "1";

  const db = readData();
  const item = db.domains[d] || { total: 0, last: 0, ips: {} };

  const payload = { ok: true, domain: d, total: item.total, last: item.last };

  if (includeIps) {
    payload.ips = item.ips; // 注意：可能很大
  }

  res.json(payload);
});

app.listen(PORT, () => {
  console.log(`Counter server running: http://127.0.0.1:${PORT}`);
});
