// public/counter.js
(() => {
  const script = document.currentScript;
  if (!script || !script.src) return;

  const serverOrigin = new URL(script.src).origin;

  const domain = (script.dataset.domain || location.hostname || "").toLowerCase();

  // ✅ 新增：项目（同域不同项目）
  // 用法：
  // - data-project="readygodule"：固定项目 key
  // - data-project="auto"：自动取 pathname 第一段，比如 /ReadyGoDuel/ -> readygodule
  const projectRaw = (script.dataset.project || "").trim();
  const deriveProjectFromPath = () => {
    try {
      const seg = (location.pathname || "/").split("/").filter(Boolean)[0] || "";
      return seg ? String(seg).toLowerCase() : "";
    } catch {
      return "";
    }
  };

  let project = "";
  if (projectRaw) {
    if (projectRaw.toLowerCase() === "auto") project = deriveProjectFromPath();
    else project = projectRaw.toLowerCase();
  }

  const targetSelector = script.dataset.target || "";
  const prefix = script.dataset.prefix || "";
  const pollMs = parseInt(script.dataset.poll || "0", 10);

  const state = {
    domain,
    project, // ✅ 新增
    serverOrigin,
    data: null,
    listeners: new Set(),
  };

  const emit = (data) => {
    state.listeners.forEach((fn) => {
      try { fn(data); } catch {}
    });
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

  const buildQuery = () => {
    // ✅ 保持旧接口 d 不变；新增可选 p
    const qs = new URLSearchParams();
    qs.set("d", state.domain);
    if (state.project) qs.set("p", state.project);
    return qs.toString();
  };

  const hit = () => {
    const hitUrl = `${serverOrigin}/hit?${buildQuery()}`;
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(hitUrl);
      } else {
        fetch(hitUrl, { cache: "no-store" }).catch(() => {});
      }
    } catch {}
  };

  const get = async () => {
    const statsUrl = `${serverOrigin}/stats?${buildQuery()}`;
    const r = await fetch(statsUrl, { cache: "no-store" });

    if (!r.ok) {
      throw new Error(`stats_http_${r.status}`);
    }

    const text = await r.text();
    if (!text) throw new Error("stats_empty");

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error("stats_bad_json");
    }

    if (!json || !json.ok) {
      throw new Error(json && json.msg ? String(json.msg) : "stats_failed");
    }

    state.data = json;
    emit(json);
    fillTarget(json);
    return json;
  };

  const on = (fn) => {
    state.listeners.add(fn);
    if (state.data) {
      try { fn(state.data); } catch {}
    }
    return () => state.listeners.delete(fn);
  };

  // ✅ 暴露全局 API（向下兼容）
  window.BFTCounter = {
    domain: state.domain,
    project: state.project, // ✅ 新增：方便外部显示/调试
    serverOrigin: state.serverOrigin,
    hit,
    get,
    on,
    peek: () => state.data,
  };

  // 默认行为：统计 + 拉取一次（保持不变）
  hit();
  get().catch(() => {});

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
