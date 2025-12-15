(() => {
  const script = document.currentScript;
  if (!script || !script.src) return;

  const serverOrigin = new URL(script.src).origin;

  const domain = (script.dataset.domain || location.hostname || "").toLowerCase();
  const project = (script.dataset.project || "").toLowerCase();

  const targetSelector = script.dataset.target || "";
  const prefix = script.dataset.prefix || "";
  const pollMs = parseInt(script.dataset.poll || "0", 10);

  const state = {
    domain,
    project,
    serverOrigin,
    data: null,
    listeners: new Set(),
  };

  const emit = (data) => {
    state.listeners.forEach(fn => {
      try { fn(data); } catch {}
    });
    try {
      window.dispatchEvent(new CustomEvent("bftcounter:update", { detail: data }));
    } catch {}
  };

  const fillTarget = (json) => {
    if (!targetSelector) return;
    const el = document.querySelector(targetSelector);
    if (el) el.textContent = `${prefix}${json?.total ?? 0}`;
  };

  const buildQuery = () => {
    let q = `d=${encodeURIComponent(domain)}`;
    if (project) q += `&p=${encodeURIComponent(project)}`;
    return q;
  };

  const hit = () => {
    const url = `${serverOrigin}/hit?${buildQuery()}`;
    try {
      if (navigator.sendBeacon) navigator.sendBeacon(url);
      else fetch(url, { cache: "no-store" }).catch(() => {});
    } catch {}
  };

  const get = async () => {
    const url = `${serverOrigin}/stats?${buildQuery()}`;
    const r = await fetch(url, { cache: "no-store" });

    if (!r.ok) throw new Error(`stats_http_${r.status}`);

    const json = await r.json();
    if (!json || !json.ok) {
      throw new Error(json?.msg || "stats_failed");
    }

    state.data = json;
    emit(json);
    fillTarget(json);
    return json;
  };

  const on = (fn) => {
    state.listeners.add(fn);
    if (state.data) fn(state.data);
    return () => state.listeners.delete(fn);
  };

  window.BFTCounter = {
    domain,
    project,
    serverOrigin,
    hit,
    get,
    on,
    peek: () => state.data,
  };

  hit();
  get().catch(() => {});

  if (pollMs > 0 && Number.isFinite(pollMs)) {
    let inflight = false;
    setInterval(() => {
      if (inflight) return;
      inflight = true;
      get().finally(() => inflight = false);
    }, pollMs);
  }
})();