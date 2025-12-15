// public/counter.js
(() => {
  const script = document.currentScript;
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

  const hit = () => {
    const hitUrl = `${serverOrigin}/hit?d=${encodeURIComponent(domain)}`;
    try {
      if (navigator.sendBeacon) navigator.sendBeacon(hitUrl);
      else fetch(hitUrl, { mode: "no-cors", cache: "no-store" }).catch(() => {});
    } catch {}
  };

  const get = async () => {
    const statsUrl = `${serverOrigin}/stats?d=${encodeURIComponent(domain)}`;
    const r = await fetch(statsUrl, { cache: "no-store" });
    const json = await r.json();
    if (!json || !json.ok) throw new Error("stats_failed");
    state.data = json;
    emit(json);

    // 可选：自动填充某个 DOM
    if (targetSelector) {
      const el = document.querySelector(targetSelector);
      if (el) el.textContent = `${prefix}${json.total}`;
    }
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

  // 暴露全局 API
  window.BFTCounter = {
    domain,
    serverOrigin,
    hit,
    get,
    on,
    // 给框架用的：直接读最后一次缓存
    peek: () => state.data,
  };

  // 默认行为：统计 + 拉取一次
  hit();
  get().catch(() => {});

  // 可选：轮询刷新（比如 data-poll="5000"）
  if (pollMs > 0 && Number.isFinite(pollMs)) {
    setInterval(() => {
      get().catch(() => {});
    }, pollMs);
  }
})();
