# domain-visit-counter（BornForThis 访问统计服务）

你好，我是悦创。

一个**轻量、可跨域、零数据库**的网页访问统计服务：前端只需引入 `counter.js`，即可按 **域名(domain)** 统计 PV；在**不破坏旧功能**的前提下，支持在同一域名下按 **项目(project)** 做更细粒度统计（例如 `ai.bornforthis.cn/ReadyGoDuel/` 单独统计），并且项目 PV 会自动“包含”进域名总 PV。

> ✅ 你现有旧站如果只用 `d=域名`：**不用改，继续可用**。

---

## 目录

- [domain-visit-counter（BornForThis 访问统计服务）](#domain-visit-counterbornforthis-访问统计服务)
  - [目录](#目录)
  - [功能特性](#功能特性)
  - [项目结构](#项目结构)
  - [快速开始](#快速开始)
    - [1）安装依赖](#1安装依赖)
    - [2）启动服务](#2启动服务)
  - [前端接入（counter.js）](#前端接入counterjs)
    - [仅域名统计（兼容旧站）](#仅域名统计兼容旧站)
    - [同域多项目统计（新增）](#同域多项目统计新增)
    - [自动识别项目名（data-project="auto"）](#自动识别项目名data-projectauto)
    - [自动填充元素（data-target）](#自动填充元素data-target)
    - [轮询刷新（data-poll）](#轮询刷新data-poll)
    - [JS API（window.BFTCounter）](#js-apiwindowbftcounter)
  - [后端 API](#后端-api)
    - [/hit](#hit)
    - [/stats](#stats)
  - [配置（config.json）](#配置configjson)
  - [数据文件（counts.txt / data.json）](#数据文件countstxt--datajson)
  - [测试](#测试)
    - [Node 回归测试（推荐）](#node-回归测试推荐)
    - [浏览器测试页面](#浏览器测试页面)
  - [部署与反代建议](#部署与反代建议)
    - [Node 进程](#node-进程)
    - [Nginx 反代](#nginx-反代)
  - [FAQ](#faq)
    - [1）为什么我会遇到 `stats_http_400`？](#1为什么我会遇到-stats_http_400)
    - [2）是不是只要明确指明 data-domain 就可以？](#2是不是只要明确指明-data-domain-就可以)
    - [3）我在 `https://ai.bornforthis.cn/ReadyGoDuel/` 怎么统计项目？](#3我在-httpsaibornforthiscnreadygoduel-怎么统计项目)
    - [4）旧站需要改吗？](#4旧站需要改吗)
  - [安全与隐私建议](#安全与隐私建议)
  - [License](#license)

---

## 功能特性

* **域名 PV 统计（默认）**：按 `d=domain` 统计总 PV、最后访问时间。
* **同域多项目 PV 统计（可选）**：同一个 `domain` 下按 `p=project` 分开统计；同时域名总 PV 会包含项目 PV。
* **跨域支持**：后端设置 `Access-Control-Allow-Origin: *`，前端可跨站读取。
* **轻量上报**：`/hit` 默认返回 `204`，适配 `navigator.sendBeacon`。
* **可选 IP 记录/脱敏**：可记录 IP 访问频次，可配置脱敏。
* **域名白名单（可选）**：默认允许所有域名；也可按根域名白名单限制。

---

## 项目结构

你当前目录：

```
.
├── config.json
├── counts.txt
├── package-lock.json
├── package.json
├── public
│   └── counter.js
├── README.md
├── server.js
└── Test
    ├── counter-test-advanced.html
    ├── counter-test.html
    └── test-counter.mjs
```

* `server.js`：统计服务端（Express）
* `public/counter.js`：前端 SDK（自动 hit + 拉取 stats + 事件派发）
* `config.json`：配置（白名单、IP 脱敏等）
* `counts.txt`：数据存储文件（你的仓库里现存该文件；实际字段以你当前 server.js 为准）
* `Test/`：测试脚本与测试页面

---

## 快速开始

### 1）安装依赖

```bash
npm i
```

### 2）启动服务

```bash
node server.js
# 或：PORT=8787 node server.js
```

默认服务地址：

* `http://127.0.0.1:8787`

---

## 前端接入（counter.js）

> `counter.js` 会暴露一个全局对象：`window.BFTCounter`。

### 仅域名统计（兼容旧站）

适用于只想统计整个站点域名 PV：

```html
<script
  src="https://counter.bornforthis.cn/counter.js"
  data-domain="ai.bornforthis.cn"
></script>
```

行为：

* `GET /hit?d=ai.bornforthis.cn`
* `GET /stats?d=ai.bornforthis.cn`

> 这就是你旧站一直在用的模式，保持兼容。

---

### 同域多项目统计（新增）

如果你的网站是同域多项目，例如：

* `https://ai.bornforthis.cn/ReadyGoDuel/`
* `https://ai.bornforthis.cn/SomeTool/`

你可以在每个项目里添加 `data-project`：

```html
<script
  src="https://counter.bornforthis.cn/counter.js"
  data-domain="ai.bornforthis.cn"
  data-project="readygodule"
></script>
```

行为：

* `GET /hit?d=ai.bornforthis.cn&p=readygodule`
* `GET /stats?d=ai.bornforthis.cn&p=readygodule`

> 同时，域名总 PV 会包含项目 PV（也就是项目 hit 会累加到 domain total）。

---

### 自动识别项目名（data-project="auto"）

如果你的路径都像 `/<ProjectName>/...`，可以让脚本自动从 `location.pathname` 提取第一段作为项目名：

```html
<script
  src="https://counter.bornforthis.cn/counter.js"
  data-domain="ai.bornforthis.cn"
  data-project="auto"
></script>
```

建议约定：

* 取 `pathname` 第一段（去掉空段）
* 转小写作为 `project`

对 `https://ai.bornforthis.cn/ReadyGoDuel/`：

* 自动 project = `readygodule`

---

### 自动填充元素（data-target）

如果你想把 PV 自动写入某个元素：

```html
<div>PV：<span id="pv">-</span></div>

<script
  src="https://counter.bornforthis.cn/counter.js"
  data-domain="ai.bornforthis.cn"
  data-project="readygodule"
  data-target="#pv"
></script>
```

可选加前缀：

```html
<script
  src="https://counter.bornforthis.cn/counter.js"
  data-domain="ai.bornforthis.cn"
  data-project="readygodule"
  data-target="#pv"
  data-prefix="PV: "
></script>
```

---

### 轮询刷新（data-poll）

适合大屏/看板：

```html
<script
  src="https://counter.bornforthis.cn/counter.js"
  data-domain="ai.bornforthis.cn"
  data-project="readygodule"
  data-target="#pv"
  data-poll="5000"
></script>
```

> SDK 内置“单飞锁”避免慢网导致请求叠加。

---

### JS API（window.BFTCounter）

引入后会有：

* `BFTCounter.hit()`：主动上报一次 PV
* `BFTCounter.get()`：拉取 stats（Promise）
* `BFTCounter.on(fn)`：订阅更新（返回取消订阅函数）
* `BFTCounter.peek()`：读取最后一次缓存

示例：React/原生都适用

```js
window.BFTCounter.get().then((data) => {
  console.log('PV total:', data.total);
});

const off = window.BFTCounter.on((data) => {
  console.log('Updated:', data);
});

// 取消监听
// off();
```

监听 DOM 事件（无全局变量写法）：

```js
window.addEventListener('bftcounter:update', (e) => {
  console.log('counter update', e.detail);
});
```

---

## 后端 API

### /hit

用途：上报 PV（GET/POST 均可）

* `GET /hit?d=<domain>`
* `GET /hit?d=<domain>&p=<project>`
* `GET /hit?d=<domain>&debug=1`（调试：返回 JSON）

返回：

* 默认 `204 No Content`（适配 sendBeacon）
* `debug=1` 返回 `{ ok: true, domain, project?, ts }`

---

### /stats

用途：获取统计

* `GET /stats?d=<domain>`
* `GET /stats?d=<domain>&p=<project>`

可选参数：

* `includeIps=1`：返回 IP 统计（可能很大）
* `includeProjects=1`：返回该 domain 下的项目汇总（用于后台面板）

返回示例：

```json
{ "ok": true, "domain": "ai.bornforthis.cn", "total": 123, "last": 1765760022924 }
```

项目级：

```json
{ "ok": true, "domain": "ai.bornforthis.cn", "project": "readygodule", "total": 45, "last": 1765760022924 }
```

---

## 配置（config.json）

默认配置（文件不存在会 fallback）：

```json
{
  "allowAll": true,
  "allowedRootDomains": [],
  "anonymizeIp": false
}
```

说明：

* `allowAll=true`：允许所有域名
* `allowAll=false`：只允许 `allowedRootDomains` 列表中的根域名及其子域名
* `anonymizeIp=true`：IP 脱敏存储（IPv4 -> /24、IPv6 -> /64）

示例：只允许 BornForThis 体系站点

```json
{
  "allowAll": false,
  "allowedRootDomains": ["bornforthis.cn"],
  "anonymizeIp": true
}
```

---

## 数据文件（counts.txt / data.json）

你的仓库里有 `counts.txt`，同时你在实现中也可能使用 `data.json`。

建议：

* **以你当前 server.js 实际读写的数据文件为准**（二选一即可）
* 如果你已切换为 `data.json`（结构化更好），可以保留 `counts.txt` 作为历史兼容或迁移源

无论是哪种格式，核心逻辑应当满足：

* `domain.total`：域名总 PV
* `domain.projects[project].total`：项目 PV
* 项目 PV 会累加进域名总 PV（包含关系）

---

## 测试

### Node 回归测试（推荐）

仓库已包含：`Test/test-counter.mjs`

示例：

```bash
node Test/test-counter.mjs --base https://counter.bornforthis.cn --domain bornforthis.cn
```

它会自动：

* 生成一个临时测试域名：`test-<ts>.bornforthis.cn`
* 生成一个临时项目名：`proj-<ts>`
* 依次验证：

  * `/stats` 初始为 0
  * `/hit` debug=1 返回 JSON
  * `/hit` 默认返回 204
  * 项目 hit 会计入域名 total
  * 项目 stats 正确
  * `includeProjects=1` 正常
  * `includeIps=1` 正常
  * 非法 domain / project 返回 400

当你看到：

```
✅ ALL TESTS PASSED
Your original features are preserved, and same-domain multi-project counting works.
```

说明：

* ✅ 旧功能保持
* ✅ 同域多项目统计可用

---

### 浏览器测试页面

你有两个测试页：

* `Test/counter-test.html`
* `Test/counter-test-advanced.html`

打开方式（本地）：

1）用任意静态服务器起一个本地目录（例如 Vite/serve/http-server）
2）访问测试页
3）观察页面中 PV 是否增长、是否能看到 project 的细分

如果你希望直接用 VSCode Live Server：

* 右键 `counter-test-advanced.html` → Open with Live Server

---

## 部署与反代建议

### Node 进程

推荐配合：

* PM2
* systemd
* Docker

### Nginx 反代

如你需要 IP 统计准确，反代请务必透传：

* `X-Forwarded-For`
* `X-Real-IP`

服务端会优先取 `X-Forwarded-For` 的第一个 IP。

---

## FAQ

### 1）为什么我会遇到 `stats_http_400`？

基本原因：请求的 `d` 不合法或为空。

常见触发：

* 动态注入 script，但忘了写 `data-domain`
* 页面处于 `localhost`、`file://` 或某些容器环境，导致 hostname 不符合规则

解决：

* 明确写：`data-domain="ai.bornforthis.cn"`

---

### 2）是不是只要明确指明 data-domain 就可以？

* **只统计域名总 PV**：是的。
* **要统计同域不同项目**：还需要 `data-project`（或 `auto`）。

---

### 3）我在 `https://ai.bornforthis.cn/ReadyGoDuel/` 怎么统计项目？

推荐：

```html
<script
  src="https://counter.bornforthis.cn/counter.js"
  data-domain="ai.bornforthis.cn"
  data-project="auto"
></script>
```

或显式：

```html
<script
  src="https://counter.bornforthis.cn/counter.js"
  data-domain="ai.bornforthis.cn"
  data-project="readygodule"
></script>
```

---

### 4）旧站需要改吗？

不需要。

旧站只要仍按 `d=domain` 上报/查询，你的系统仍保持可用。

---

## 安全与隐私建议

* 默认 `/stats` 不返回 IP；只有 `includeIps=1` 才返回（建议仅内部使用）。
* 面向公众站点建议：

  * `anonymizeIp=true`
  * `allowAll=false` 并配置 `allowedRootDomains` 限制滥用

---

## License

按你的仓库实际 License 填写（如未设置，可先用 MIT）。
