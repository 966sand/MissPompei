// analytics.js — 双端事件契约（唯一真源，服务端 + 网页端共用）
//
// 为什么要有这份文件：网页与小程序各自埋点，事件名一旦漂移，两端数字就再也对不上。
// 而「双端口径一致」是本项目一贯的硬要求（品牌名、内容池、短语、提示词都是这么守的），
// 埋点没有理由例外。这里定义事件名与字段白名单。
//
// 小程序侧的真源在 miss-pompei-mp/cloudfunctions/analyze/track.js ——
// 云函数是独立打包上传的，只能 require 自己目录内的文件，所以必然有自己的副本
// （prompts.js / reading-pool.js 也是同样的处境）。
// mp-analytics-test.js 会对这两个真源逐名比对，并扫描两端源码里的 track('...') 字面量，
// 防止「真源改了、埋点处漏改」。
//
// 谁在什么端产生哪个事件：
//   网页客户端：page_view · tab_switch · mode_switch · query_submit · tts_play · reading_load · favorite · share
//   网页服务端：query_result（要带耗时与成败，只有服务端知道）
//   小程序客户端：与网页客户端同名的 8 个
//   小程序服务端：query_result（云函数内，带耗时与成败）
// 页面级「真实请求量」不走事件表，走服务端的 hits 计数（见 server.js 的 bumpHits），
// 因为客户端埋点会被广告拦截器屏蔽（实测屏蔽率可达 20~40%）。

export const SCHEMA_VERSION = 1;

// 事件名。两端必须完全一致（比对时排序，顺序无关）。
export const EVENTS = [
  'page_view',     // 进入页面
  'tab_switch',    // 切底部 tab
  'mode_switch',   // 切场景：口语翻译 / 近义词查询
  'query_submit',  // 提交查询（q 存原文，是「用户在查什么」的需求图谱）
  'query_result',  // 查询返回，带耗时与成败（服务端产生）
  'tts_play',      // 播放发音
  'reading_load',  // 拉取短文
  'favorite',      // 收藏 / 取消收藏
  'share',         // 分享
];

// 每个事件允许的字段（公共字段另计）。白名单之外的字段一律丢弃 ——
// /api/ev 是公网匿名入口，不做白名单就等于把存储交给任何人。
export const EVENT_PROPS = {
  page_view: ['path', 'from'],
  tab_switch: ['tab'],
  mode_switch: ['mode'],
  query_submit: ['kind', 'len', 'q'],
  query_result: ['kind', 'ok', 'ms', 'err'],
  tts_play: ['len'],
  reading_load: ['page', 'source'],
  favorite: ['op', 'kind'],
  share: ['channel'],
};

// 公共字段：两端各自填充，服务端只做裁剪，不覆盖
export const COMMON_PROPS = ['ts', 'sid', 'uid', 'p', 'v'];

export const MAX_EVENTS_PER_BATCH = 20;
export const MAX_STR = 120;   // 普通字符串字段上限
export const MAX_Q = 60;      // 查询词单独限长：够画词频，又不至于把整段话存进来

// 数值型字段：不转成字符串，报告里要直接做求和与均值
const NUMERIC_PROPS = new Set(['len', 'ms', 'ok', 'page']);

function clip(v, max) {
  return String(v == null ? '' : v).slice(0, max);
}

// 把一条原始事件收敛成「契约内」的形状。识别不了的事件名返回 null（直接丢弃）。
export function sanitizeEvent(raw, platform) {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.e || '');
  if (!EVENTS.includes(name)) return null;

  const out = {
    e: name,
    p: platform,
    v: SCHEMA_VERSION,
    // ts 允许客户端自带，但只在合理范围内采信（防伪造出跨年数据把日报打歪）
    ts: (Number.isFinite(+raw.ts) && Math.abs(Date.now() - +raw.ts) < 86400000) ? +raw.ts : Date.now(),
  };
  if (raw.sid) out.sid = clip(raw.sid, 40);
  if (raw.uid) out.uid = clip(raw.uid, 40);

  for (const k of EVENT_PROPS[name] || []) {
    if (raw[k] == null || raw[k] === '') continue;
    if (NUMERIC_PROPS.has(k)) {
      const n = Number(raw[k]);
      if (Number.isFinite(n)) out[k] = n;
      continue;
    }
    out[k] = clip(raw[k], k === 'q' ? MAX_Q : MAX_STR);
  }
  return out;
}

export function isValidEventName(name) {
  return EVENTS.includes(String(name || ''));
}
