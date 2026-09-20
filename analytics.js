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

// ---------- 存储凭证体检（server.js 用来决定「落库」还是「走日志兜底」） ----------
//
// 为什么需要：Render 的变量框把值原样保存，粘多行或带引号都不会报错。
// 而 server.js 原先的兜底判据是「两个变量都为空」—— 一旦值填坏（非空但不可用），
// 判据失效：事件既不进 Redis、也不打日志，静默丢失；更糟的是含换行的
// Authorization 会让 fetch 在 Headers.append 处抛错，日志里只留一行看不懂的报错。
// 所以这里先显式识别「明显不是凭证」的形态，宁可降级为日志兜底（数据还在），
// 也不要假装配置成功。判定保持保守：只拦无歧义的坏形态，避免误判真凭证。
export function credIssue(url, token) {
  if (!url && !token) return '';
  if (!url) return '只配了 token、缺 URL';
  if (!token) return '只配了 URL、缺 token';
  if (!/^https?:\/\/\S+$/.test(url)) return 'URL 含空白或不是 http(s) 链接';
  if (/\s/.test(token)) return 'token 含空白或换行';
  if (/^["']|["']$/.test(token)) return 'token 两端带引号';
  if (token.includes('UPSTASH_REDIS_REST_')) return 'token 里粘的是 ".env 的 KEY= 行" 而不是 token';
  return '';
}

// 写日志前脱敏：凭证填错时，报错信息里可能整段带着 Authorization 的值。
// 除了替换明文，还要把换行压成空格 —— 否则日志查看器只显示第一行，
// 后面的内容（可能含真 token）看不见却仍被记录。
export function redactSecret(text, ...secrets) {
  let t = String(text == null ? '' : text);
  for (const s of secrets) {
    if (!s) continue;
    t = t.split(s).join('***');
    // 兜一层：值被截断/转义后仍可能以开头片段露头
    if (s.length >= 12) t = t.split(s.slice(0, 12)).join('***');
  }
  return t.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 300);
}
