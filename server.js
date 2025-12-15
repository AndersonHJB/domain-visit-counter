// server.js
const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 8787;

const DATA_FILE = path.join(__dirname, "counts.txt");
const PUBLIC_DIR = path.join(__dirname, "public");

// ===== 简单的进程内锁（单机单实例足够用）=====
let writing = Promise.resolve();
function withLock(fn) {
  writing = writing.then(fn, fn);
  return writing;
}

// ===== 读写 counts.txt（内容是 JSON 文本）=====
function readCounts() {
  if (!fs.existsSync(DATA_FILE)) return {};
  const raw = fs.readFileSync(DATA_FILE, "utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    // 如果文件被人为改坏了，避免服务挂掉
    return {};
  }
}

function writeCounts(obj) {
  // 原子写：写临时文件再 rename，避免写到一半中断导致损坏
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf8");
  fs.renameSync(tmp, DATA_FILE);
}

// ===== 基本安全：只允许域名字符 =====
function sanitizeDomain(s) {
  if (!s) return "";
  s = String(s).toLowerCase().trim();
  // 只允许 a-z 0-9 . -（足够域名用）
  if (!/^[a-z0-9.-]{1,253}$/.test(s)) return "";
  return s;
}

// ===== 允许跨域加载 counter.js / 调用接口（最宽松版）=====
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use("/public", express.static(PUBLIC_DIR, { maxAge: "1h" }));

// 访问计数：/hit?d=example.com
app.get("/hit", (req, res) => {
  const d = sanitizeDomain(req.query.d);
  if (!d) return res.status(400).json({ ok: false, error: "invalid domain" });

  // 尽量不阻塞：返回 204，同时后台写入（这里仍是串行锁写，避免并发写坏文件）
  withLock(() => {
    const counts = readCounts();
    const now = Date.now();

    if (!counts[d]) counts[d] = { total: 0, last: 0 };
    counts[d].total += 1;
    counts[d].last = now;

    writeCounts(counts);
  });

  // 204：像统计像素一样，不返回内容
  res.status(204).end();
});

// 查询：/stats?d=example.com
app.get("/stats", (req, res) => {
  const d = sanitizeDomain(req.query.d);
  if (!d) return res.status(400).json({ ok: false, error: "invalid domain" });

  const counts = readCounts();
  const item = counts[d] || { total: 0, last: 0 };
  res.json({ ok: true, domain: d, total: item.total, last: item.last });
});

// 生成给网页引用的脚本（也可以直接 /public/counter.js）
// 你可以把它挂在根路径更好用：https://counter.your.com/counter.js
app.get("/counter.js", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "counter.js"));
});

app.listen(PORT, () => {
  console.log(`Counter server running: http://localhost:${PORT}`);
  console.log(`JS: http://localhost:${PORT}/counter.js`);
});
