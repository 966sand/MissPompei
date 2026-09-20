// track.js — 网页端埋点（同源、零依赖、不阻塞）
//
// 设计要点：
// 1) 同源上报（POST /api/ev），不引任何第三方脚本 —— 项目至今零外部依赖，
//    也不该为了统计去拖一份 30KB 的 CDN 脚本进来影响 LCP（做过一轮 SEO 优化的人
//    不该在最后一步把首屏还回去）。
// 2) 批量 + 定时发送：单次最多 12 条、2.5 秒合并一次，不因一次点击就发一个请求。
// 3) 失败一律静默：埋点永远不是主流程。fetch 用 keepalive，页面关闭也能带上。
// 4) 事件名与字段白名单由服务端 /analytics.js 校验：这里只负责如实上报。
//
// 事件名必须落在 miss-sorrento/analytics.js 的 EVENTS 里（web-analytics-test 会扫本源码校验）。

(function () {
  var ENDPOINT = '/api/ev';
  var MAX_BATCH = 12;
  var FLUSH_MS = 2500;

  var queue = [];
  var timer = null;

  // 匿名设备 id：只用来算 UV，不含任何可识别信息。沿用 localStorage，
  // 与 ms_favorites / ms_recent 同一处存储（清缓存即彻底消失）。
  var UID = (function () {
    try {
      var k = 'ms_uid';
      var v = localStorage.getItem(k);
      if (!v) {
        v = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
        localStorage.setItem(k, v);
      }
      return v;
    } catch (e) { return ''; }
  })();

  // 会话 id：每次打开页面重算。同一个 uv 在一天内可能对应多个 sid。
  var SID = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  function payload() {
    return { v: 1, sid: SID, uid: UID, events: queue };
  }

  function send() {
    if (!queue.length) return;
    var body = JSON.stringify(payload());
    queue = [];
    try {
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        keepalive: true,
      })['catch'](function () { /* 埋点失败绝不影响主流程 */ });
    } catch (e) { /* 忽略 */ }
  }

  function schedule() {
    if (timer) return;
    timer = setTimeout(function () { timer = null; send(); }, FLUSH_MS);
  }

  function track(name, props) {
    if (!name) return;
    var ev = { e: String(name), ts: Date.now() };
    if (props) {
      for (var k in props) {
        if (Object.prototype.hasOwnProperty.call(props, k) && props[k] != null) ev[k] = props[k];
      }
    }
    queue.push(ev);
    if (queue.length >= MAX_BATCH) {
      if (timer) { clearTimeout(timer); timer = null; }
      send();
    } else {
      schedule();
    }
  }

  // 离开页面时兜底：sendBeacon 在 pagehide 下比 fetch 可靠（不受 keepalive 配额限制）
  function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!queue.length) return;
    var body = JSON.stringify(payload());
    if (navigator.sendBeacon) {
      try {
        navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
        queue = [];
        return;
      } catch (e) { /* 退到 fetch */ }
    }
    send();
  }

  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flush();
  });

  window.mstrack = track;
  window.mstrackFlush = flush;
})();
