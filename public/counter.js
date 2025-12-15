// public/counter.js
(() => {
  // 统计服务地址：默认用当前脚本的来源域名（推荐把 counter.js 放在统计服务器上）
  const script = document.currentScript;
  const serverOrigin = new URL(script.src).origin;

  // 被统计的域名：默认用当前页面 hostname
  const domain = (script.dataset.domain || location.hostname || "").toLowerCase();

  // 显示位置：默认找 #visit-count，也可通过 data-target 指定选择器
  const targetSelector = script.dataset.target || "#visit-count";

  // 是否显示文字前缀（可选）
  const prefix = script.dataset.prefix || "";

  // 发起统计（不阻塞页面）
  const hitUrl = `${serverOrigin}/hit?d=${encodeURIComponent(domain)}`;

  // 尽量用 sendBeacon，失败再用 fetch/no-cors
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(hitUrl);
    } else {
      fetch(hitUrl, { mode: "no-cors", cache: "no-store" }).catch(() => {});
    }
  } catch {}

  // 拉取并展示
  const statsUrl = `${serverOrigin}/stats?d=${encodeURIComponent(domain)}`;

  fetch(statsUrl, { cache: "no-store" })
    .then(r => r.json())
    .then(data => {
      if (!data || !data.ok) return;
      const el = document.querySelector(targetSelector);
      if (el) el.textContent = `${prefix}${data.total}`;
    })
    .catch(() => {});
})();
