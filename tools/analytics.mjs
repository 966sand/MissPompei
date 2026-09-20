#!/usr/bin/env node
// tools/analytics.mjs — 双端埋点日报（零依赖，Node 20+ 内置 fetch）
//
// 用法：
//   node tools/analytics.mjs                    # 今天的网页端日报
//   node tools/analytics.mjs --days 7           # 最近 7 天
//   node tools/analytics.mjs --date 2026-09-20  # 指定某天
//   node tools/analytics.mjs --json             # 输出原始事件，自己接别的分析
//
// 需要 UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN（写在 .env 或环境变量里）。
// 没配也能跑：会把提示打出来，而不是抛一堆栈。
//
// ⚠️ 口径说明（重要，别把两条通道混着算）：
//   1) 「真实请求量」来自 hits:<date>，是**服务端自己数的 HTML 文档请求**，
//      抗广告拦截（客户端埋点实测会被屏蔽 20~40%），爬虫单独记在 hits:bot。
//      但它只有请求次数，没有用户标识 → 不能算 UV。
//   2) 「事件明细」来自 ev:<date>，含 uid（网页是 localStorage 匿名 id，
//      小程序是 openid）。UV 只能在这里算，且**两端 uid 体系不通**，
//      所以只能做「事件量对比」，做不了同一用户跨端。
//   3) 小程序端的数据在云开发控制台的 events 集合里，不在 Redis。
//      这个脚本读的是网页端；小程序侧要到「云开发 → 数据库 → events」看，
//      或者把集合导出成 JSONL 后走 --file 模式（见下）。

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// 复用 server.js 那套零依赖 .env 加载，不为了一个脚本引 dotenv
function loadEnv() {
  const p = join(ROOT, '.env');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const v = m[2].replace(/^["']|["']$/g, '');
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}
loadEnv();

const URL_BASE = (process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/+$/, '');
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';

// ---------- 参数 ----------
const argv = process.argv.slice(2);
function argOf(name) {
  const i = argv.indexOf('--' + name);
  return i >= 0 ? argv[i + 1] : null;
}
const AS_JSON = argv.includes('--json');
const FILE = argOf('file');            // 直接读一份 JSONL（云开发导出的 events 也能用）
const DAYS = Math.max(1, Math.min(90, Number(argOf('days')) || 1));
const SINGLE = argOf('date');

// 按北京时间分桶，与 server.js / 云函数的 dayKey 保持一致
function dayKey(d = new Date()) {
  return new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}
function shiftDay(key, delta) {
  const t = new Date(key + 'T00:00:00Z').getTime() + delta * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

const today = dayKey();
const dates = SINGLE
  ? [SINGLE]
  : Array.from({ length: DAYS }, (_, i) => shiftDay(today, -(DAYS - 1 - i)));

// ---------- 取数 ----------
async function redis(cmds) {
  const r = await fetch(URL_BASE + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds),
  });
  if (!r.ok) throw new Error('Upstash ' + r.status + ' ' + (await r.text()).slice(0, 200));
  const j = await r.json();
  return (Array.isArray(j) ? j : []).map((x) => (x && x.result));
}

async function fetchDay(date) {
  const [evRaw, hitsRaw, botRaw] = await redis([
    ['LRANGE', 'ev:' + date, '0', '-1'],
    ['HGETALL', 'hits:' + date],
    ['HGETALL', 'hits:bot:' + date],
  ]);
  const events = (evRaw || []).map((s) => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
  return { date, events, hits: pairsToObj(hitsRaw), bot: pairsToObj(botRaw) };
}

// HGETALL 在 REST 里返回扁平数组 [field, value, field, value, ...]
function pairsToObj(arr) {
  const o = {};
  if (!Array.isArray(arr)) return o;
  for (let i = 0; i + 1 < arr.length; i += 2) o[arr[i]] = Number(arr[i + 1]) || 0;
  return o;
}

function readFileEvents(file) {
  return readFileSync(file, 'utf8').split('\n').filter(Boolean)
    .map((s) => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
}

// ---------- 聚合 ----------
function topN(map, n = 10) {
  return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, n);
}
function bump(map, k, by = 1) {
  const key = k == null || k === '' ? '(空)' : String(k);
  map[key] = (map[key] || 0) + by;
}
function pct(a, b) { return b ? (a / b * 100).toFixed(1) + '%' : '-'; }
function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[i];
}
function hostOf(ref) {
  if (!ref) return '(直接访问)';
  try { return new URL(ref).hostname; } catch { return '其它'; }
}

function summarize(day) {
  const ev = day.events;
  const byName = {};
  for (const e of ev) bump(byName, e.e);

  const uniq = (xs) => new Set(xs.filter(Boolean)).size;
  const web = ev.filter((e) => e.p === 'web');
  const mp = ev.filter((e) => e.p === 'mp');

  const paths = {}; const froms = {}; const words = {}; const wordsByKind = {};
  const kinds = {}; const sources = {}; const channels = {}; const ops = {};
  const errs = []; const ms = []; let ok = 0, fail = 0;
  const tabs = {}; const modes = {}; const ttsLens = [];

  for (const e of ev) {
    if (e.e === 'page_view') { bump(paths, e.path); bump(froms, hostOf(e.from)); }
    if (e.e === 'query_submit') {
      bump(words, e.q);
      bump(wordsByKind, (e.kind || '?') + ' · ' + e.q);
      bump(kinds, e.kind);
    }
    if (e.e === 'query_result') {
      if (e.ok) ok++; else { fail++; bump(errs, e.err); }
      if (Number.isFinite(e.ms)) ms.push(e.ms);
    }
    if (e.e === 'tts_play') ttsLens.push(e.len || 0);
    if (e.e === 'reading_load') bump(sources, e.source);
    if (e.e === 'favorite') bump(ops, e.op);
    if (e.e === 'share') bump(channels, e.channel);
    if (e.e === 'tab_switch') bump(tabs, e.tab);
    if (e.e === 'mode_switch') bump(modes, e.mode);
  }
  ms.sort((a, b) => a - b);

  const hitTotal = Object.values(day.hits).reduce((a, b) => a + b, 0);
  const botTotal = Object.values(day.bot).reduce((a, b) => a + b, 0);

  return {
    day, ev, byName, web, mp, uniq, paths, froms, words, wordsByKind, kinds,
    sources, channels, ops, errs, ms, ok, fail, tabs, modes, ttsLens,
    hitTotal, botTotal,
    uv: uniq(ev.map((e) => e.uid)),
    uvWeb: uniq(web.map((e) => e.uid)),
    uvMp: uniq(mp.map((e) => e.uid)),
    sessions: uniq(ev.map((e) => e.sid)),
    pv: byName.page_view || 0,
  };
}

// ---------- 输出 ----------
function bar(n, max, width = 18) {
  const w = max > 0 ? Math.max(1, Math.round(n / max * width)) : 0;
  return '█'.repeat(w) + '░'.repeat(Math.max(0, width - w));
}
function section(title) { console.log('\n' + title); }
function table(rows, keyHeader = '项', valHeader = '次', limit = 10) {
  const list = rows.slice(0, limit);
  if (!list.length) { console.log('  （无数据）'); return; }
  const max = list[0][1];
  const kw = Math.max(keyHeader.length, ...list.map((r) => String(r[0]).length));
  console.log('  ' + keyHeader.padEnd(kw) + '  ' + valHeader.padStart(6) + '  ' + '占比');
  for (const [k, v] of list) {
    console.log('  ' + String(k === '(空)' ? '—' : k).padEnd(kw) + '  ' + String(v).padStart(6) + '  ' + bar(v, max));
  }
}

const days = [];
if (FILE) {
  const events = readFileEvents(FILE);
  const byDate = {};
  for (const e of events) bump(byDate, dayKey(new Date(e.ts || Date.now())));
  for (const d of Object.keys(byDate).sort()) {
    days.push(summarize({ date: d, events: events.filter((e) => dayKey(new Date(e.ts || Date.now())) === d), hits: {}, bot: {} }));
  }
} else if (!URL_BASE || !TOKEN) {
  console.log('未配置 Upstash 凭证，读不到事件。两种办法：');
  console.log('  A) 在 .env 里补上（Render 控制台同一组值）：');
  console.log('     UPSTASH_REDIS_REST_URL=https://xxx.upstash.io');
  console.log('     UPSTASH_REDIS_REST_TOKEN=xxx');
  console.log('  B) 直接读一份 JSONL：node tools/analytics.mjs --file events.jsonl');
  console.log('\n（没配也不影响线上：server.js 会在 Render Logs 里打 [ev] 结构化行）');
  process.exit(0);
} else {
  for (const d of dates) days.push(summarize(await fetchDay(d)));
}

if (AS_JSON) {
  console.log(JSON.stringify(days.map((s) => ({
    date: s.day.date, pv: s.pv, uv: s.uv, uvWeb: s.uvWeb, uvMp: s.uvMp,
    sessions: s.sessions, hits: s.hitTotal, botHits: s.botTotal,
    events: s.ev.length, byName: s.byName,
    topPaths: topN(s.paths, 20), topFrom: topN(s.froms, 20), topWords: topN(s.words, 30),
    queryResult: { ok: s.ok, fail: s.fail, p50: percentile(s.ms, 0.5), p95: percentile(s.ms, 0.95) },
  })), null, 2));
  process.exit(0);
}

for (const s of days) {
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  地道英语口语助手 · ' + s.day.date + ' 数据日报');
  console.log('════════════════════════════════════════════════════════════');

  section('■ 流量（服务端计数，抗广告拦截）');
  console.log('  埋点 PV       ' + s.pv + '   会话 ' + s.sessions + '   事件总量 ' + s.ev.length);
  if (FILE) {
    console.log('  真实页面请求  未统计（--file 模式只读事件明细，没有服务端计数）');
  } else {
    console.log('  真实页面请求  ' + s.hitTotal
      + '   其中爬虫  ' + s.botTotal
      + '   人类约 ' + Math.max(0, s.hitTotal - s.botTotal));
    console.log('  真实请求与埋点 PV 的差值 ≈ 被广告拦截器屏蔽掉的比例（'
      + pct(s.hitTotal - s.pv, s.hitTotal) + '）');
  }

  section('■ 用户（UV 按 uid 去重；两端 uid 体系不通，只能各算各的）');
  console.log('  网页 UV  ' + s.uvWeb + '    小程序 UV  ' + s.uvMp + '    合计  ' + s.uv);

  section('■ 访问路径');
  table(topN(s.paths, 12), '页面路径');

  section('■ 来源');
  table(topN(s.froms, 8), '来源');

  section('■ 高频用户行为');
  table(topN(s.words, 15), '查询词');

  section('■ 场景分布');
  table(topN(s.kinds, 5), 'kind');
  table(topN(s.tabs, 5), 'tab');
  table(topN(s.modes, 5), 'mode');
  table(topN(s.sources, 4), '短文来源');

  section('■ 查询成败与耗时（服务端唯一来源）');
  const total = s.ok + s.fail;
  console.log('  成功 ' + s.ok + ' / ' + total + '（' + pct(s.ok, total) + '）'
    + '   P50 ' + percentile(s.ms, 0.5) + 'ms   P95 ' + percentile(s.ms, 0.95) + 'ms');
  if (s.errs && Object.keys(s.errs).length) {
    console.log('  失败原因 TOP：');
    table(topN(s.errs, 6), '原因');
  }

  section('■ 发音 / 收藏 / 分享（正向行为，越高越好）');
  console.log('  发音次数 ' + s.ttsLens.length
    + '   收藏 ' + Object.values(s.ops).reduce((a, b) => a + b, 0)
    + '   分享 ' + Object.values(s.channels).reduce((a, b) => a + b, 0));
  table(topN(s.ops, 4), '收藏动作');
  table(topN(s.channels, 4), '分享渠道');
}

if (days.length > 1) {
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  趋势（' + days[0].day.date + ' → ' + days[days.length - 1].day.date + '）');
  console.log('════════════════════════════════════════════════════════════');
  console.log('  日期          真实请求   埋点PV     网页UV    查询数   成功数   发音数');
  const maxHit = Math.max(...days.map((d) => d.hitTotal), 1);
  for (const d of days) {
    const q = d.byName.query_submit || 0;
    console.log('  ' + d.day.date + '  ' + String(d.hitTotal).padStart(7) + '  '
      + String(d.pv).padStart(7) + '  ' + String(d.uvWeb).padStart(7) + '  '
      + String(q).padStart(7) + '  ' + String(d.ok).padStart(7) + '  '
      + String(d.ttsLens.length).padStart(7) + '  ' + bar(d.hitTotal, maxHit));
  }
}

console.log('');
