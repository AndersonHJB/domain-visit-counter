# Domain Visit Counter

**按域名访问统计 · 支持 IP 记录 · JSON 存储 · 前端可取数渲染**

一个轻量级、自托管的网页访问统计服务。
网站只需引入一个 `counter.js`，即可完成：

* 访问量统计（PV）
* IP 记录 / UV 计算
* 前端自由获取统计数据并自行渲染
* 可选域名白名单控制（支持多个根域名）
* 数据持久化为 JSON 文件（无数据库依赖）

---

## ✨ 功能特性

* ✅ **按域名统计**（默认 `location.hostname`）
* ✅ **自动计数**（页面加载即 +1，支持 `sendBeacon`）
* ✅ **记录访问 IP**

  * 支持真实 IP 或脱敏存储
* ✅ **JSON 文件存储**

  * 单文件数据源，易备份、易迁移
* ✅ **前端可取数渲染**

  * `window.BFTCounter.get()`
  * `bftcounter:update` 事件
* ✅ **域名访问控制**

  * 默认允许所有域名
  * 可配置仅允许指定根域名（支持多个）
* ✅ **GET / POST 兼容**

  * 完全兼容 Nginx 反代 + `sendBeacon`

---

## 📦 项目结构

```text
domain-visit-counter/
├── server.js          # 后端服务
├── config.json        # 服务配置（域名白名单 / IP 策略）
├── data.json          # 统计数据（自动生成）
├── public/
│   └── counter.js     # 前端接入脚本
└── README.md
```

---

## ⚙️ 配置说明（config.json）

```json
{
  "allowAll": true,
  "allowedRootDomains": ["bornforthis.cn", "example.com"],
  "anonymizeIp": false
}
```

### 字段说明

| 字段                   | 类型       | 说明                  |
| -------------------- | -------- | ------------------- |
| `allowAll`           | boolean  | 是否允许所有域名使用统计服务      |
| `allowedRootDomains` | string[] | 允许的**根域名**列表（支持子域名） |
| `anonymizeIp`        | boolean  | 是否对 IP 进行脱敏存储       |

#### 域名匹配规则

* `bornforthis.cn` ✔
* `ai.bornforthis.cn` ✔
* `xxx.ai.bornforthis.cn` ✔
* `not-allowed.com` ✖

---

## 🗂 数据存储格式（data.json）

```json
{
  "version": 1,
  "domains": {
    "ai.bornforthis.cn": {
      "total": 13,
      "last": 1765760022924,
      "ips": {
        "1.2.3.4": {
          "count": 5,
          "first": 1765760000000,
          "last": 1765760022924
        }
      }
    }
  }
}
```

### 字段说明

| 字段             | 说明           |
| -------------- | ------------ |
| `total`        | 累计访问次数（PV）   |
| `last`         | 最后一次访问时间戳    |
| `ips`          | 按 IP 聚合的访问数据 |
| `count`        | 该 IP 访问次数    |
| `first / last` | 首次 / 最近访问时间  |

---

## 🚀 启动与运行

### 1️⃣ 安装依赖

```bash
npm install
```

### 2️⃣ 启动服务

```bash
node server.js
```

默认监听：

```text
http://127.0.0.1:8787
```

---

## 🌐 接口说明

### 写入统计（计数 +1）

* `GET  /hit?d=<domain>`
* `POST /hit?d=<domain>`（兼容 `sendBeacon`）

```bash
curl -X POST "https://counter.bornforthis.cn/hit?d=localhost"
```

返回：`204 No Content`

---

### 查询统计

```http
GET /stats?d=<domain>
```

返回示例：

```json
{
  "ok": true,
  "domain": "localhost",
  "total": 13,
  "last": 1765760022924
}
```

#### 返回 IP 数据（可选）

```http
GET /stats?d=<domain>&includeIps=1
```

> ⚠️ 注意：IP 数据可能较大，建议仅用于管理或分析场景。

---

## 🖥 前端使用方法

### 方式一：最简单（自动渲染）

```html
<span id="visit-count">-</span>

<script
  src="https://counter.bornforthis.cn/counter.js"
  data-target="#visit-count"
  data-prefix="访问量："
></script>
```

---

### 方式二：主动获取数据（推荐）

```html
<div id="pv"></div>

<script src="https://counter.bornforthis.cn/counter.js"></script>
<script>
  window.BFTCounter.get().then(({ total }) => {
    document.querySelector('#pv').textContent = `访问量：${total}`;
  });
</script>
```

---

### 方式三：监听更新事件（组件化友好）

```html
<script src="https://counter.bornforthis.cn/counter.js"></script>
<script>
  window.addEventListener("bftcounter:update", (e) => {
    const { domain, total } = e.detail;
    console.log("update:", domain, total);
  });
</script>
```

---

## 🔧 counter.js 可选参数

| 参数            | 说明            |
| ------------- | ------------- |
| `data-domain` | 手动指定统计域名      |
| `data-target` | 自动渲染的 DOM 选择器 |
| `data-prefix` | 自动渲染前缀        |
| `data-poll`   | 轮询刷新时间（ms）    |

```html
<script
  src="https://counter.bornforthis.cn/counter.js"
  data-domain="ai.bornforthis.cn"
  data-target="#count"
  data-prefix="PV："
  data-poll="5000"
></script>
```

---

## 🔐 Nginx 反代注意事项（必须）

确保真实 IP 能传给 Node：

```nginx
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
```

否则记录到的将是内网 IP。

---

## ⚠️ 合规与安全建议

* IP 属于个人数据，请谨慎对外暴露
* 生产环境建议：

  * 开启 `anonymizeIp: true`
  * 或仅用于 UV 去重（Hash IP）
  * 限制 `includeIps=1` 为管理员使用

---

## 📌 适用场景

* 个人博客 / 技术站点
* 静态网站（VuePress / Vite / Astro）
* 内部统计 / 教学演示
* 自托管轻量统计替代方案

---

## 🧭 后续可扩展方向

* UV（日去重 / IP Hash）
* 按页面 path 统计
* IP 限流 / 防刷
* Admin Key 鉴权
* 数据自动归档 / 清理

---

**Maintained by BornForThis · AI悦创**
