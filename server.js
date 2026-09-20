// server.js — Miss Sorrento 后端（零外部依赖，Node 20+ 内置 http + fetch）
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, extname, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PORT, DEEPSEEK_API_KEY } from './config.js';
import { validateInput, validateColloquialInput, toTokens } from './validate.js';
import {
  buildSinglePrompt,
  buildMultiPrompt,
  buildColloquialPrompt,
  buildReadingPrompt,
  COLLOQUIAL_SYSTEM_PROMPT,
  READING_SYSTEM_PROMPT,
} from './prompts.js';
import { callDeepSeek } from './deepseek.js';
import { READING_POOL } from './reading-pool.js';
import { sanitizeEvent, MAX_EVENTS_PER_BATCH, credIssue, redactSecret } from './analytics.js';
import {
  originOf,
  renderPhrasePage,
  renderReadPage,
  renderRobots,
  renderSitemap,
  renderIndexHead,
  renderPopularHtml,
  renderReadsHtml,
} from './content-pages.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  // og:image 是社交平台的抓取目标，MIME 必须准确 ——
  // 缺这一条会退化成 application/octet-stream，部分平台直接拒绝缩略图。
  '.png': 'image/png',
};

function readBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        req.destroy();
        reject(new Error('请求体过大'));
      }
      data += c;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// 静态资源：内容指纹 + no-cache，客户端每次都回源校验（命中则 304）。
// 此前只发 Content-Type，没有任何缓存指令或校验器，客户端无回源依据：
// 换了品牌名/改了口径，手机和微信内核仍可能无限期停在旧页面（「顶部还是旧名字」就是这么来的）。
// RFC 7232：If-None-Match 用弱比较。CDN（如 Cloudflare）会把强 ETag 改写成弱 ETag
// （"abc" → W/"abc"），严格 === 会永远不匹配、退化成每次都回全量。故忽略 W/ 前缀，
// 并支持逗号分隔列表与通配符 *。
function etagMatches(header, etag) {
  if (!header) return false;
  const strip = (s) => String(s).trim().replace(/^W\//i, '');
  const mine = strip(etag);
  return String(header)
    .split(',')
    .some((raw) => {
      const t = strip(raw);
      return t === '*' || t === mine;
    });
}

async function serveStatic(req, pathname, res) {
  const rel = pathname === '/' ? '/index.html' : pathname;
  const filePath = normalize(join(PUBLIC_DIR, rel));
  // 防目录穿越
  if (!filePath.startsWith(PUBLIC_DIR + sep)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  try {
    let data = await readFile(filePath);
    // 首页是 SPA 外壳，但爬虫需要一个「这不是空站」的最小信号：
    // 注入 head 元数据 + 把前几条热门短语预渲染成真实链接（不执行 JS 也能发现内容页）。
    if (rel === '/index.html') {
      const origin = originOf(req);
      data = Buffer.from(
        String(data)
          .replace('<!--SEO_HEAD-->', renderIndexHead(origin))
          .replace('<!--PRERENDER:POPULAR-->', renderPopularHtml())
          .replace('<!--PRERENDER:READS-->', renderReadsHtml()),
        'utf8'
      );
    }
    const mt = MIME[extname(filePath)] || 'application/octet-stream';
    const etag = '"' + createHash('sha1').update(data).digest('hex').slice(0, 16) + '"';
    if (etagMatches(req.headers['if-none-match'], etag)) {
      res.writeHead(304, { ETag: etag, 'Cache-Control': 'no-cache' });
      return res.end();
    }
    res.writeHead(200, {
      'Content-Type': mt,
      'Cache-Control': 'no-cache',
      ETag: etag,
    });
    res.end(data);
  } catch (e) {
    // 不能静默吞掉：文件缺失与「文件在但渲染出错」都会落到这里，
    // 没有日志的话两者在线上完全无从区分（都只是 404）。
    if (e && e.code !== 'ENOENT') console.error('[static]', rel, e && e.message);
    res.writeHead(404);
    res.end('Not Found');
  }
}

function sendJSON(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

// ══════════════════════ 埋点：接收 / 落地 / 报告 ══════════════════════
//
// 两条互相独立的通道，不能混：
//   1) 事件明细（ev:<date>）—— 客户端发来的行为事件 + 服务端产生的 query_result。
//      会被广告拦截器屏蔽，用于「用户干了什么」。
//   2) 页面请求计数（hits:<date>）—— 服务端自己数的 HTML 文档请求，抗 AdBlock，
//      用于「真实来了多少流量」。爬虫单独记在 hits:bot:<date>，方便配合 SEO 工作。
//
// ⚠️ 为什么必须写外部存储：Render 免费实例**没有持久盘**，容器在休眠（无流量 15 分钟）、
// 重新部署、冷启动时都会换一块干净的文件系统 —— 写本地文件等于每天归零，而且不报错。
// 默认 fallback 是结构化 console 行（Render Logs 里立刻能看），
// 配了 Upstash 的 REST 凭证就落到 Redis（纯 fetch，守住本项目「零外部依赖」的约定）。
// 注意别用 Render 自带的免费 Postgres：它 90 天后会被永久删除。
// 先 trim（Render 的变量框很容易带上尾部换行/空格），再做体检；
// 体检不通过的按「未配置」处理，于是自动落到下面的日志兜底 —— 数据不丢，只是不能聚合。
const UPSTASH_URL_RAW = String(process.env.UPSTASH_REDIS_REST_URL || '').trim();
const UPSTASH_TOKEN_RAW = String(process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
const UPSTASH_ISSUE = credIssue(UPSTASH_URL_RAW, UPSTASH_TOKEN_RAW);
const UPSTASH_URL = UPSTASH_ISSUE ? '' : UPSTASH_URL_RAW.replace(/\/+$/, '');
const UPSTASH_TOKEN = UPSTASH_ISSUE ? '' : UPSTASH_TOKEN_RAW;
const EV_RETENTION_DAYS = 90;

if (UPSTASH_ISSUE) {
  // 必须显式喊出来：这种填错法的默认后果是「静默丢数据」，最难发现。
  console.error(`[ev] Upstash 凭证格式可疑（${UPSTASH_ISSUE}）→ 已按未配置处理：事件改走日志兜底，不会丢，只是不能聚合。`);
  console.error('[ev] 修法：Render → Environment 里 UPSTASH_REDIS_REST_URL 只填 https://xxx.upstash.io，UPSTASH_REDIS_REST_TOKEN 只填 token 本身（不含 KEY=、引号、换行）。');
}

// 按北京时间分桶：用户与运营都在东八区，跨零点的日报必须与直觉一致。
// 用 UTC 分桶会让「今天」从早上 8 点开始，日报每天都错半天。
function dayKey(d = new Date()) {
  return new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

// Upstash REST：一次 HTTP 带上多条命令（pipeline），比逐条发省往返。
// tag 区分是哪条通道（事件明细 / 页面计数），否则 hits 失败会记成 [ev] 前缀，
// 排查时按 [hit] 搜不到任何东西。
async function redisPipeline(cmds, tag = '[ev]') {
  if (!UPSTASH_URL || !UPSTASH_TOKEN || !cmds.length) return null;
  try {
    const r = await fetch(UPSTASH_URL + '/pipeline', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + UPSTASH_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(cmds),
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) {
      console.error(tag, 'sink', r.status,
        redactSecret(String(await r.text()).slice(0, 200), UPSTASH_TOKEN_RAW, UPSTASH_TOKEN));
      return null;
    }
    return await r.json();
  } catch (e) {
    // e.message 常只有 "fetch failed"，真正的原因在 e.cause（ENOTFOUND / ECONNREFUSED / 证书…）
    const cause = (e && e.cause && (e.cause.code || e.cause.message)) || '';
    const msg = redactSecret((e && e.message) || String(e), UPSTASH_TOKEN_RAW, UPSTASH_TOKEN) || 'fetch failed';
    console.error(tag, 'sink', msg, cause ? `(${cause})` : '');
    return null;
  }
}

// 事件明细：逐条 RPUSH 到当天列表，并给整表设 90 天过期（不设就会无限增长）。
// 落库失败时**不吞**：改写成日志明细行。日志是免费档最后一道网，
// 宁可刷屏也留着原始数据（修好后可人工补录），静默丢掉才是最坏的。
async function sinkEvents(events) {
  if (!events.length) return;
  if (UPSTASH_URL && UPSTASH_TOKEN) {
    const key = 'ev:' + dayKey();
    const cmds = events.map((e) => ['RPUSH', key, JSON.stringify(e)]);
    cmds.push(['EXPIRE', key, String(EV_RETENTION_DAYS * 86400)]);
    if (await redisPipeline(cmds)) return;
    console.warn(`[ev] sink 不通 → 本批 ${events.length} 条事件改走日志兜底`);
  }
  for (const e of events) console.log('[ev] ' + JSON.stringify(e));
}

const BOT_RE = /bot|crawler|spider|slurp|bingpreview|yandex|baiduspider|sogou|360spider|bytespider|semrush|ahrefs|petalbot/i;

function isHtmlDocPath(p) {
  return p === '/' || /^\/(phrase|read)\/[a-z0-9][a-z0-9-]*\/?$/.test(p);
}

// 页面请求计数：只用 HINCRBY 在服务端聚合，不落原始行（省存储、省读放大）。
// 刻意不 await —— 统计不该拖慢任何一次页面加载。
// 写不进去就退化成一行日志（同 sinkEvents 的策略：不静默丢计数）。
function bumpHits(req, path) {
  const bot = BOT_RE.test(String(req.headers['user-agent'] || ''));
  const key = (bot ? 'hits:bot:' : 'hits:') + dayKey();
  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    console.log('[hit] ' + (bot ? 'bot ' : '') + path);
    return;
  }
  redisPipeline([
    ['HINCRBY', key, path, 1],
    ['EXPIRE', key, String(EV_RETENTION_DAYS * 86400)],
  ], '[hit]').then((r) => {
    if (!r) console.log('[hit] ' + (bot ? 'bot ' : '') + path);
  }, () => {});
}

// 服务端产生的事件：没有 sid（服务端不认识浏览器那边的匿名 id），
// 只有纯量级意义，不参与 UV 口径。
function recordServerEvent(name, props, platform = 'web', uid = '') {
  const e = sanitizeEvent(Object.assign({ e: name, ts: Date.now(), uid }, props), platform);
  if (e) sinkEvents([e]).catch(() => {});
}

function clientIp(req) {
  // Render 前面有 CDN，真实来源在 x-forwarded-for 的第一段
  const xf = String(req.headers['x-forwarded-for'] || '');
  return (xf.split(',')[0] || (req.socket && req.socket.remoteAddress) || '').trim().slice(0, 60);
}

// 极简限流：进程内计数即可（免费版只有一个实例）。
// /api/ev 是匿名公网入口，没有闸门就等于把存储交给任何人。
const evRate = new Map();
const EV_RATE_MAX = 240;   // 每 IP 每分钟「事件条数」

function allowEv(ip, n) {
  const now = Date.now();
  let rec = evRate.get(ip);
  if (!rec || now - rec.at > 60000) {
    if (evRate.size > 5000) evRate.clear();   // 防内存无限增长
    rec = { at: now, n: 0 };
    evRate.set(ip, rec);
  }
  rec.n += n;
  return rec.n <= EV_RATE_MAX;
}

async function handleEvent(req, res, ip) {
  let body;
  try {
    body = JSON.parse(await readBody(req, 256 * 1024));
  } catch {
    return sendJSON(res, 400, { error: '请求格式错误' });
  }

  const raw = Array.isArray(body && body.events) ? body.events.slice(0, MAX_EVENTS_PER_BATCH) : [];
  if (!allowEv(ip, Math.max(raw.length, 1))) return sendJSON(res, 429, { error: 'too many events' });

  const sid = body && body.sid;
  const uid = body && body.uid;
  const out = [];
  for (const item of raw) {
    const e = sanitizeEvent(Object.assign({ sid, uid }, item), 'web');
    if (e) out.push(e);
  }
  await sinkEvents(out);
  res.writeHead(204);
  res.end();
}

// ---------- 近义词辨析 / 口语翻译（同一入口，用 kind 分流） ----------
// 拆成 analyzeCore（返回 {status, body}，不写响应）+ handleAnalyze（写响应 + 埋点）：
// 这样 query_result 能一次拿到耗时与成败，而不必在六七个 return 分支上各埋一遍。
async function analyzeCore(body) {
  const kind = body?.kind === 'colloquial' ? 'colloquial' : 'synonym';

  if (kind === 'colloquial') {
    const v = validateColloquialInput(body?.input || '');
    if (!v.ok) return { status: 400, body: { error: v.msg }, kind };

    const data = await callDeepSeek(buildColloquialPrompt(v.normalized), {
      system: COLLOQUIAL_SYSTEM_PROMPT,
      maxTokens: 2500,
    });
    return { status: 200, body: { ...data, mode: 'colloquial', zh: data.zh || v.normalized }, kind };
  }

  const v = validateInput(body?.input || '');
  if (!v.ok) return { status: 400, body: { error: v.msg }, kind };

  const tokens = toTokens(v.normalized);
  const mode = tokens.length >= 2 ? 'multi' : 'single';
  const userPrompt =
    mode === 'multi' ? buildMultiPrompt(tokens) : buildSinglePrompt(tokens[0]);
  const data = await callDeepSeek(userPrompt, { maxTokens: 4000 });
  return { status: 200, body: data, kind };
}

async function handleAnalyze(req, res) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    return sendJSON(res, 400, { error: '请求格式错误' });
  }

  const t0 = Date.now();
  let status = 502;
  let kind = body?.kind === 'colloquial' ? 'colloquial' : 'synonym';
  let errMsg = '';
  try {
    const r = await analyzeCore(body);
    status = r.status;
    kind = r.kind;
    if (status >= 400) errMsg = String(r.body?.error || '').slice(0, 60);
    return sendJSON(res, status, r.body);
  } catch (e) {
    errMsg = String((e && e.message) || 'DeepSeek 调用失败').slice(0, 60);
    return sendJSON(res, 502, { error: errMsg });
  } finally {
    // query_result 只有服务端产得出来：客户端只知道「我按下去了」，
    // 不知道这次成没成、花了多久。成功率与 P50/P95 耗时的唯一来源是这里。
    recordServerEvent('query_result', {
      kind,
      ok: status === 200 ? 1 : 0,
      ms: Date.now() - t0,
      err: errMsg,
    });
  }
}

// ---------- 阅读推荐 ----------
// 进程内缓存已生成的批次，避免回看/多人访问时重复消耗 token
const readingCache = new Map();
const READING_CACHE_MAX = 12;

function rememberReadingBatch(page, articles) {
  readingCache.set(page, articles);
  while (readingCache.size > READING_CACHE_MAX) {
    readingCache.delete(readingCache.keys().next().value);
  }
}

// 模型偶尔不按 \n\n 分段，正文会变成一大坨。这里统一成 3 段，保证阅读体验。
function normalizeBody(body) {
  let b = String(body || '').replace(/\r/g, '').trim();
  b = b.replace(/\n{2,}/g, '\n\n').replace(/\n(?!\n)/g, ' ');
  if (b.includes('\n\n')) return b;
  const sents = b.match(/[^.!?]+[.!?]+["\u201d]?/g) || [b];
  if (sents.length < 4) return b;
  const size = Math.ceil(sents.length / 3);
  const parts = [];
  for (let i = 0; i < sents.length; i += size) {
    parts.push(sents.slice(i, i + size).join(' ').trim());
  }
  return parts.join('\n\n');
}

// 硬约束「每篇小于 500 字符」：超长时在句号处截断，宁可丢掉尾句也不截成半句
function capLength(body, max) {
  const b = String(body || '');
  if (b.length <= max) return b;
  const head = b.slice(0, max);
  const lastEnd = Math.max(
    head.lastIndexOf('. '),
    head.lastIndexOf('! '),
    head.lastIndexOf('? ')
  );
  if (lastEnd > max * 0.6) return head.slice(0, lastEnd + 1).trim();
  return head.replace(/\s+\S*$/, '').trim();
}

function cleanArticles(list) {
  return (Array.isArray(list) ? list : [])
    .filter((a) => a && a.title && a.body)
    .slice(0, 5)
    .map((a) => ({
      title: String(a.title).slice(0, 80),
      topic: String(a.topic || '日常').slice(0, 12),
      body: capLength(normalizeBody(a.body), 490),
      background: String(a.background || ''),
      reason: String(a.reason || ''),
      words: Array.isArray(a.words) ? a.words.slice(0, 3).map(String) : [],
    }));
}

async function handleReading(url, res) {
  const page = Math.max(0, Math.min(999, Number(url.searchParams.get('page')) || 0));

  const cached = readingCache.get(page);
  if (cached) return sendJSON(res, 200, { mode: 'reading', page, source: 'cache', articles: cached });

  // 上一批的主题作为避让项，减少跨批次重复
  const prev = readingCache.get(page - 1);
  const avoid = prev ? prev.map((a) => a.topic).filter(Boolean) : [];

  try {
    const data = await callDeepSeek(buildReadingPrompt(page, avoid), {
      system: READING_SYSTEM_PROMPT,
      maxTokens: 4000,
    });
    const articles = cleanArticles(data?.articles);
    if (!articles.length) throw new Error('模型未返回文章');
    rememberReadingBatch(page, articles);
    return sendJSON(res, 200, { mode: 'reading', page, source: 'ai', articles });
  } catch (e) {
    // 生成失败也要有内容可看：回退到预置文章池（按 page 轮转）
    const pool = READING_POOL[page % READING_POOL.length] || READING_POOL[0];
    return sendJSON(res, 200, {
      mode: 'reading',
      page,
      source: 'fallback',
      note: e.message || '生成失败，已切换预置文章',
      articles: cleanArticles(pool),
    });
  }
}

// ---------- 发音代理 ----------
// 浏览器直连第三方 TTS 会被 CORS / Referer 挡掉，这里同源代理一层，顺带可被 CDN 缓存。
const TTS_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const TTS_MAX_CHARS = 200;

async function fetchTTS(text) {
  // 上游 1：Google translate_tts —— 对整句稳定可靠
  try {
    const u = new URL('https://translate.google.com/translate_tts');
    u.searchParams.set('ie', 'UTF-8');
    u.searchParams.set('q', text);
    u.searchParams.set('tl', 'en');
    u.searchParams.set('client', 'tw-ob');
    const r = await fetch(u, {
      headers: { 'User-Agent': TTS_UA, Referer: 'https://translate.google.com/' },
      signal: AbortSignal.timeout(12000),
    });
    if (r.ok) {
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 1000) return buf;
    }
  } catch { /* 试下一个上游 */ }

  // 上游 2：有道 dictvoice（英式，单词发音更自然）
  try {
    const u = new URL('https://dict.youdao.com/dictvoice');
    u.searchParams.set('audio', text);
    u.searchParams.set('type', '1');
    const r = await fetch(u, {
      headers: { 'User-Agent': TTS_UA },
      signal: AbortSignal.timeout(12000),
    });
    if (r.ok) {
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 1000) return buf;
    }
  } catch { /* 两个上游都失败 */ }

  return null;
}

async function handleTTS(url, res) {
  let text = (url.searchParams.get('text') || '').trim();
  if (!text) return sendJSON(res, 400, { error: '缺少 text 参数' });

  // 上限保护：Google 单次约 200 字符，超出按词边界截断，避免整段报废
  if ([...text].length > TTS_MAX_CHARS) {
    const cut = [...text].slice(0, TTS_MAX_CHARS).join('');
    text = cut.replace(/\s+\S*$/, '') || cut;
  }

  const buf = await fetchTTS(text);
  if (!buf) return sendJSON(res, 502, { error: '发音服务暂时不可用' });

  res.writeHead(200, {
    'Content-Type': 'audio/mpeg',
    'Content-Length': buf.length,
    'Cache-Control': 'public, max-age=604800, immutable',
  });
  res.end(buf);
}

// ---------- 内容页 / 爬虫文件（服务端渲染） ----------
// 全站是 SPA —— index.html 的正文容器是空的，文字全靠 app.js 注入，而查询又走
// POST /api/analyze 不产生 URL。对爬虫而言整站只有一个没有内容的地址。
// 这里把已有内容资产渲染成**独立、不依赖 JS 的完整页面**，并生成 sitemap/robots。
// 页面同样走 no-cache + ETag，避免 CDN 或浏览器长期缓存住旧版式。
function sendMarkup(res, req, type, body, status = 200) {
  const data = Buffer.from(body, 'utf8');
  const etag = '"' + createHash('sha1').update(data).digest('hex').slice(0, 16) + '"';
  if (etagMatches(req.headers['if-none-match'], etag)) {
    res.writeHead(304, { ETag: etag, 'Cache-Control': 'no-cache' });
    return res.end();
  }
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-cache', ETag: etag });
  res.end(data);
}

function notFoundPage() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>页面不存在 · 地道英语口语助手</title>
<meta name="robots" content="noindex" />
<link rel="stylesheet" href="/content.css" />
</head>
<body>
<header class="hd"><a class="hd-brand" href="/">地道英语口语助手</a></header>
<main class="wrap">
  <h1>没有找到这个页面</h1>
  <p class="lead">链接可能写错了，或者这条内容已经被移除。</p>
  <a class="cta" href="/">回到地道英语口语助手首页</a>
</main>
</body>
</html>
`;
}

function handleContentPage(req, res, kind, slug) {
  const origin = originOf(req);
  const page =
    kind === 'phrase' ? renderPhrasePage(slug, origin) : renderReadPage(slug, origin);
  // 找不到必须给 404：若返回 200，搜索引擎会把不存在的 slug 当有效页收录，
  // 站内产生大量软 404，反过来拖累整站抓取优先级。
  if (!page) return sendMarkup(res, req, 'text/html; charset=utf-8', notFoundPage(), 404);
  return sendMarkup(res, req, 'text/html; charset=utf-8', page.html);
}

const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (req.method === 'POST' && url.pathname === '/api/analyze') {
      return await handleAnalyze(req, res);
    }
    if (req.method === 'POST' && url.pathname === '/api/ev') {
      return await handleEvent(req, res, clientIp(req));
    }
    if (req.method === 'GET' && url.pathname === '/api/reading') {
      return await handleReading(url, res);
    }
    if (req.method === 'GET' && url.pathname === '/api/tts') {
      return await handleTTS(url, res);
    }
    if (req.method === 'GET') {
      if (url.pathname === '/robots.txt') {
        return sendMarkup(res, req, 'text/plain; charset=utf-8', renderRobots(originOf(req)));
      }
      if (url.pathname === '/sitemap.xml') {
        return sendMarkup(res, req, 'application/xml; charset=utf-8', renderSitemap(originOf(req)));
      }
      // 页面级真实请求量：在返回之前打点，且不 await（统计不拖慢页面加载）
      if (isHtmlDocPath(url.pathname)) bumpHits(req, url.pathname);
      const m = url.pathname.match(/^\/(phrase|read)\/([a-z0-9][a-z0-9-]*)\/?$/);
      if (m) return handleContentPage(req, res, m[1], m[2]);
      return await serveStatic(req, url.pathname, res);
    }
  } catch {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: '服务器内部错误' }));
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`Miss Sorrento 已启动： http://localhost:${PORT}`);
  // 判据是「key 到手了没有」，不是「有没有 .env 文件」：
  // Render 上不存在 .env（变量由平台直接注入 process.env），按文件判会导致
  // 每次部署都误报「DeepSeek 调用将返回 500」，而线上其实是好的。
  if (!DEEPSEEK_API_KEY) {
    console.warn(
      '提示：未配置 DEEPSEEK_API_KEY，analyze 调用将返回 500。本地写进 .env，Render 写进 Environment。'
    );
  }
});
