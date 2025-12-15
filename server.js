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
    .map((s) => String(s).toLowerCase().trim())
    .filter(Boolean);
  cfg.anonymizeIp = !!cfg.anonymizeIp;
  return cfg;
}

// 只允许域名字符（保持原逻辑不变）
function sanitizeDomain(s) {
  if (!s) return "";
  s = String(s).toLowerCase().trim();
  if (!/^[a-z0-9.-]{1,253}$/.test(s)) return "";
  return s;
}

// ✅ 新增：项目标识（同域不同项目）
// 例：ReadyGoDuel / blog / docs-v2 / tools_01
// 只允许安全字符，不允许斜杠（因为我们用 query 传 p，不传完整 path）
function sanitizeProject(s) {
  if (!s) return "";
  s = String(s).trim();

  // 支持用户传 "ReadyGoDuel"（大小写），内部统一为小写存储
  s = s.replace(/^\//, "").replace(/\/$/, ""); // 去掉首尾斜杠
  s = s.toLowerCase();

  // project key：1~80
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/.test(s)) return "";
  return s;
}

// 从 Nginx 反代拿真实 IP：优先 X-Forwarded-For
function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff) {
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
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    const parts = ip.split(".");
    return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  }
  if (ip.includes(":")) {
    return ip.split(":").slice(0, 4).join(":") + "::/64";
  }
  return ip;
}

// 判断是否允许 domain（按根域名）
function isAllowedDomain(domain, cfg) {
  if (cfg.allowAll) return true;
  if (!domain) return false;
  return cfg.allowedRootDomains.some((root) => domain === root || domain.endsWith("." + root));
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
  // ✅ 兼容旧数据：version 1 也能读
  const db = readJsonSafe(DATA_FILE, { version: 2, domains: {} });
  if (!db || typeof db !== "object") return { version: 2, domains: {} };
  if (!db.domains || typeof db.domains !== "object") db.domains = {};
  if (!db.version) db.version = 2;
  return db;
}

function writeData(data) {
  writeJsonAtomic(DATA_FILE, data);
}

function ensureDomainRecord(db, d) {
  if (!db.domains[d]) db.domains[d] = { total: 0, last: 0, ips: {}, projects: {} };
  const item = db.domains[d];

  // ✅ 向下兼容：旧数据没有 projects 字段
  if (!item.ips || typeof item.ips !== "object") item.ips = {};
  if (typeof item.total !== "number") item.total = 0;
  if (typeof item.last !== "number") item.last = 0;
  if (!item.projects || typeof item.projects !== "object") item.projects = {};
  return item;
}

function ensureProjectRecord(domainItem, p) {
  if (!domainItem.projects[p]) domainItem.projects[p] = { total: 0, last: 0, ips: {} };
  const proj = domainItem.projects[p];
  if (!proj.ips || typeof proj.ips !== "object") proj.ips = {};
  if (typeof proj.total !== "number") proj.total = 0;
  if (typeof proj.last !== "number") proj.last = 0;
  return proj;
}

function bumpIp(ipsObj, ip, now) {
  if (!ip) return;
  if (!ipsObj[ip]) ipsObj[ip] = { count: 0, first: now, last: now };
  ipsObj[ip].count += 1;
  ipsObj[ip].last = now;
}

// 计数逻辑（GET/POST 都走它）
function hitHandler(req, res) {
  const cfg = loadConfig();

  const d = sanitizeDomain(req.query.d);
  if (!d) {
    return res.status(400).json({ ok: false, error: "invalid_domain", msg: "invalid_domain" });
  }

  if (!isAllowedDomain(d, cfg)) {
    return res.status(403).json({ ok: false, error: "domain_not_allowed", msg: "domain_not_allowed" });
  }

  // ✅ 新增：可选项目 p（同域不同项目）
  // 不传 p：完全等同旧行为
  const pRaw = req.query.p;
  const p = sanitizeProject(pRaw);

  // 如果用户传了 p 但不合法，给明确 400（方便定位）
  if (pRaw != null && pRaw !== "" && !p) {
    return res.status(400).json({ ok: false, error: "invalid_project", msg: "invalid_project" });
  }

  const rawIp = getClientIp(req);
  const ip = cfg.anonymizeIp ? anonymizeIp(rawIp) : rawIp;

  const now = Date.now();

  withLock(() => {
    const db = readData();
    db.version = 2;

    const domainItem = ensureDomainRecord(db, d);

    // ✅ 主域名总计（包含一切：无 p + 有 p 的访问）
    domainItem.total += 1;
    domainItem.last = now;
    bumpIp(domainItem.ips, ip, now);

    // ✅ 如果带项目：同时累加到 projects[p]
    if (p) {
      const proj = ensureProjectRecord(domainItem, p);
      proj.total += 1;
      proj.last = now;
      bumpIp(proj.ips, ip, now);
    }

    writeData(db);
  });

  // ✅ 默认保持 204（不破坏 sendBeacon/原逻辑）
  const debug = String(req.query.debug || "") === "1";
  if (debug) {
    return res.json({ ok: true, domain: d, project: p || null, ts: now });
  }
  res.status(204).end();
}

app.get("/hit", hitHandler);
app.post("/hit", hitHandler);

// stats
// ✅ 不传 p：返回主域名汇总（旧行为）
// ✅ 传 p：返回该项目汇总（同时主域名仍然包含它）
//
// 额外增强：
// - includeIps=1：返回 ips（与旧一致）
// - includeProjects=1：返回 projects 概览（不带 ips，防止太大）
app.get("/stats", (req, res) => {
  const cfg = loadConfig();

  const d = sanitizeDomain(req.query.d);
  if (!d) {
    return res.status(400).json({ ok: false, error: "invalid_domain", msg: "invalid_domain" });
  }

  if (!isAllowedDomain(d, cfg)) {
    return res.status(403).json({ ok: false, error: "domain_not_allowed", msg: "domain_not_allowed" });
  }

  const pRaw = req.query.p;
  const p = sanitizeProject(pRaw);
  if (pRaw != null && pRaw !== "" && !p) {
    return res.status(400).json({ ok: false, error: "invalid_project", msg: "invalid_project" });
  }

  const includeIps = String(req.query.includeIps || "") === "1";
  const includeProjects = String(req.query.includeProjects || "") === "1";

  const db = readData();
  const domainItem = db.domains[d] || { total: 0, last: 0, ips: {}, projects: {} };

  // ✅ 项目维度 stats
  if (p) {
    const proj = (domainItem.projects && domainItem.projects[p]) || { total: 0, last: 0, ips: {} };
    const payload = { ok: true, domain: d, project: p, total: proj.total || 0, last: proj.last || 0 };
    if (includeIps) payload.ips = proj.ips || {};
    return res.json(payload);
  }

  // ✅ 域名汇总（旧行为）
  const payload = { ok: true, domain: d, total: domainItem.total || 0, last: domainItem.last || 0 };

  if (includeIps) payload.ips = domainItem.ips || {};

  // ✅ 可选返回项目列表概览（不破坏旧接口：只有显式请求才返回）
  if (includeProjects) {
    const projects = domainItem.projects && typeof domainItem.projects === "object" ? domainItem.projects : {};
    // 只返回轻量字段，避免巨大响应
    payload.projects = Object.fromEntries(
      Object.entries(projects).map(([k, v]) => [
        k,
        { total: (v && v.total) || 0, last: (v && v.last) || 0 },
      ])
    );
  }

  res.json(payload);
});

app.listen(PORT, () => {
  console.log(`Counter server running: http://127.0.0.1:${PORT}`);
});
