# Domain Visit Counter（按域名访问统计 / 可前端取数渲染）

一个轻量级访问量统计服务：网站只需引入一个 `counter.js`，即可**按域名统计**并且**在网站端拿到统计数据进行渲染展示**。
后端数据持久化到本地 `counts.txt`（JSON 文本），便于备份/迁移。

---

## 1. 功能特性

* ✅ **按域名统计**：以 `location.hostname` 作为默认统计 key
* ✅ **自动计数**：页面加载即 `hit` +1（支持 `sendBeacon`）
* ✅ **可取数渲染**：网站可通过 `window.BFTCounter.get()` 获取数据，自由渲染 UI
* ✅ **事件通知**：数据更新时派发 `bftcounter:update` 事件，适配组件化渲染
* ✅ **文件存储**：数据落地 `counts.txt`（JSON 文本）
* ✅ **接口简单**：`/hit` 写入，`/stats` 查询

---

## 2. 接口说明

### 2.1 写入统计（计数 +1）

* `GET /hit?d=<domain>`
* `POST /hit?d=<domain>`（兼容 `navigator.sendBeacon()`）

返回：`204 No Content`

示例：

```bash
curl -i -X POST "https://counter.bornforthis.cn/hit?d=localhost"
```

### 2.2 查询统计

* `GET /stats?d=<domain>`

返回示例：

```json
{
  "ok": true,
  "domain": "localhost",
  "total": 13,
  "last": 1765760022924
}
```

示例：

```bash
curl "https://counter.bornforthis.cn/stats?d=localhost"
```

---

## 3. 本地运行（开发）

### 3.1 安装依赖

```bash
npm i
```

### 3.2 启动服务

```bash
node server.js
```

默认监听：

* `http://localhost:8787/counter.js`
* `http://localhost:8787/stats?d=localhost`

---

## 4. 生产部署（Nginx + 域名）

假设你的 Node 服务跑在本机：

* `127.0.0.1:8787`

域名：

* `counter.bornforthis.cn`

### 4.1 Nginx 配置（示例）

> SSL 证书路径按你的服务器实际替换（宝塔会生成对应路径）。

**HTTP → HTTPS**

```nginx
server {
    listen 80;
    server_name counter.bornforthis.cn;

    location /.well-known/acme-challenge/ {
        root /www/wwwroot/counter.bornforthis.cn;
    }

    return 301 https://$host$request_uri;
}
```

**HTTPS 反代到 Node**

```nginx
upstream counter_backend {
    server 127.0.0.1:8787;
    keepalive 64;
}

server {
    listen 443 ssl http2;
    server_name counter.bornforthis.cn;

    ssl_certificate     /www/server/panel/vhost/cert/counter.bornforthis.cn/fullchain.pem;
    ssl_certificate_key /www/server/panel/vhost/cert/counter.bornforthis.cn/privkey.pem;

    location / {
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_pass http://counter_backend;
    }

    # counter.js 可缓存（可选）
    location = /counter.js {
        proxy_pass http://counter_backend;
        add_header Cache-Control "public, max-age=3600";
    }
}
```

应用配置：

```bash
nginx -t && nginx -s reload
```

---

## 5. 网站接入（只需引入 JS）

### 5.1 最简单：自动渲染到某个元素

```html
<span id="visit-count">-</span>

<script
  src="https://counter.bornforthis.cn/counter.js"
  data-target="#visit-count"
  data-prefix="访问量："
></script>
```

### 5.2 主动获取数据（推荐：你自己渲染 UI）

```html
<div id="pv">-</div>

<script src="https://counter.bornforthis.cn/counter.js"></script>
<script>
  window.BFTCounter.get().then(({ total }) => {
    document.querySelector('#pv').textContent = `访问量：${total}`;
  });
</script>
```

### 5.3 监听更新事件（更组件化）

```html
<script src="https://counter.bornforthis.cn/counter.js"></script>
<script>
  window.addEventListener("bftcounter:update", (e) => {
    const { total, domain } = e.detail;
    console.log("update:", domain, total);
    // 在这里做你自己的渲染逻辑
  });
</script>
```

---

## 6. counter.js 参数（可选）

通过 `<script>` 的 data-* 配置：

* `data-domain`：指定统计域名（默认 `location.hostname`）
* `data-target`：自动渲染目标元素选择器（默认不自动渲染）
* `data-prefix`：自动渲染时的前缀文字
* `data-poll`：轮询刷新统计（ms），例如 `5000` 每 5 秒刷新一次

示例：

```html
<script
  src="https://counter.bornforthis.cn/counter.js"
  data-domain="ai.bornforthis.cn"
  data-target="#visit-count"
  data-prefix="访问量："
  data-poll="5000"
></script>
```

---

## 7. 数据文件说明（counts.txt）

`counts.txt` 是一个 JSON 文本（仍是 txt），结构示例：

```json
{
  "ai.bornforthis.cn": { "total": 1234, "last": 1765760022924 },
  "bornforthis.cn": { "total": 88, "last": 1765760123456 }
}
```

字段含义：

* `total`：累计访问次数
* `last`：最后一次计数时间戳（毫秒）

---

## 8. 调试与排错

### 8.1 确认 counter.js 是否可访问

```bash
curl -I https://counter.bornforthis.cn/counter.js
```

### 8.2 确认 hit 是否能写入

> 注意：`sendBeacon()` 是 **POST**，所以后端必须支持 `POST /hit`。

```bash
curl -i -X POST "https://counter.bornforthis.cn/hit?d=localhost"
```

### 8.3 确认 stats 是否能读出

```bash
curl "https://counter.bornforthis.cn/stats?d=localhost"
```

### 8.4 浏览器控制台常见问题

* `BFTCounter is undefined`：JS 未加载成功/路径不对
* CORS 报错：后端需设置 `Access-Control-Allow-Origin`（本项目默认 `*`）
* 一直为 0：通常是 `/hit` 没有成功写入（检查是否支持 POST）

---

## 9. 安全建议（可选增强）

当前为了“能用优先”，CORS 默认是 `*`。如果你希望只允许自己的网站调用，可改为白名单（例如只允许 `bornforthis.cn` / `ai.bornforthis.cn` 等）。
