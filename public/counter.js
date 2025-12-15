// public/counter.js
(() => {
  const script = document.currentScript;
  if (!script || !script.src) return;

  const serverOrigin = new URL(script.src).origin;

  const domain = (script.dataset.domain || location.hostname || "").toLowerCase();
  const targetSelector = script.dataset.target || ""; // 可选：自动填充某个元素
  const prefix = script.dataset.prefix || "";
  const pollMs = parseInt(script.dataset.poll || "0", 10); // 可选：轮询刷新，单位 ms

  const state = {
    domain,
    serverOrigin,
    data: null,
    listeners: new Set(),
  };

  const emit = (data) => {
    state.listeners.forEach((fn) => {
      try { fn(data); } catch {}
    });
    // 同时派发 DOM 事件，方便不用全局变量的写法
    try {
      window.dispatchEvent(new CustomEvent("bftcounter:update", { detail: data }));
    } catch {}
  };

  const fillTarget = (json) => {
    if (!targetSelector) return;
    try {
      const el = document.querySelector(targetSelector);
      if (el) el.textContent = `${prefix}${(json && json.total != null) ? json.total : 0}`;
    } catch {}
  };

  const hit = () => {
    const hitUrl = `${serverOrigin}/hit?d=${encodeURIComponent(domain)}`;
    try {
      // sendBeacon 最适合“只上报不关心返回”的计数
      if (navigator.sendBeacon) {
        navigator.sendBeacon(hitUrl);
      } else {
        // 不用 no-cors，避免吞错误（你服务已允许跨域）
        fetch(hitUrl, { cache: "no-store" }).catch(() => {});
      }
    } catch {}
  };

  const get = async () => {
    const statsUrl = `${serverOrigin}/stats?d=${encodeURIComponent(domain)}`;

    const r = await fetch(statsUrl, { cache: "no-store" });

    // 先处理 HTTP 层错误，避免直接 r.json() 崩
    if (!r.ok) {
      throw new Error(`stats_http_${r.status}`);
    }

    // 用 text 再 parse，能处理空响应/非 JSON（比如反代错误页）
    const text = await r.text();
    if (!text) {
      throw new Error("stats_empty");
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error("stats_bad_json");
    }

    if (!json || !json.ok) {
      // 如果后端有 msg，直接透出更好定位
      throw new Error(json && json.msg ? String(json.msg) : "stats_failed");
    }

    state.data = json;
    emit(json);
    fillTarget(json);
    return json;
  };

  const on = (fn) => {
    state.listeners.add(fn);
    // 如果已经有数据，立即推一次，方便首次渲染
    if (state.data) {
      try { fn(state.data); } catch {}
    }
    return () => state.listeners.delete(fn);
  };

  // 暴露全局 API（保持不变）
  window.BFTCounter = {
    domain,
    serverOrigin,
    hit,
    get,
    on,
    peek: () => state.data,
  };

  // 默认行为：统计 + 拉取一次（保持不变）
  hit();
  get().catch(() => {});

  // 可选：轮询刷新（比如 data-poll="5000"）
  // 为避免慢网叠加请求，做一个“单飞”锁
  if (pollMs > 0 && Number.isFinite(pollMs)) {
    let inflight = false;
    setInterval(() => {
      if (inflight) return;
      inflight = true;
      get().catch(() => {}).finally(() => {
        inflight = false;
      });
    }, pollMs);
  }
})();