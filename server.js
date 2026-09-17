// server.js — Miss Sorrento 后端（零外部依赖，Node 20+ 内置 http + fetch）
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, extname, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PORT } from './config.js';
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
import {
  originOf,
  renderPhrasePage,
  renderReadPage,
  renderRobots,
  renderSitemap,
  renderIndexHead,
  renderPopularHtml,
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
          .replace('<!--PRERENDER:POPULAR-->', renderPopularHtml()),
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
  } catch {
    res.writeHead(404);
    res.end('Not Found');
  }
}

function sendJSON(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

// ---------- 近义词辨析 / 口语翻译（同一入口，用 kind 分流） ----------
async function handleAnalyze(req, res) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    return sendJSON(res, 400, { error: '请求格式错误' });
  }

  const kind = body?.kind === 'colloquial' ? 'colloquial' : 'synonym';

  try {
    if (kind === 'colloquial') {
      const v = validateColloquialInput(body?.input || '');
      if (!v.ok) return sendJSON(res, 400, { error: v.msg });

      const data = await callDeepSeek(buildColloquialPrompt(v.normalized), {
        system: COLLOQUIAL_SYSTEM_PROMPT,
        maxTokens: 2500,
      });
      return sendJSON(res, 200, { ...data, mode: 'colloquial', zh: data.zh || v.normalized });
    }

    const v = validateInput(body?.input || '');
    if (!v.ok) return sendJSON(res, 400, { error: v.msg });

    const tokens = toTokens(v.normalized);
    const mode = tokens.length >= 2 ? 'multi' : 'single';
    const userPrompt =
      mode === 'multi' ? buildMultiPrompt(tokens) : buildSinglePrompt(tokens[0]);
    const data = await callDeepSeek(userPrompt, { maxTokens: 4000 });
    return sendJSON(res, 200, data);
  } catch (e) {
    return sendJSON(res, 502, { error: e.message || 'DeepSeek 调用失败' });
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
<title>页面不存在 · 地道口语助手</title>
<meta name="robots" content="noindex" />
<link rel="stylesheet" href="/content.css" />
</head>
<body>
<header class="hd"><a class="hd-brand" href="/">地道口语助手</a></header>
<main class="wrap">
  <h1>没有找到这个页面</h1>
  <p class="lead">链接可能写错了，或者这条内容已经被移除。</p>
  <a class="cta" href="/">回到地道口语助手首页</a>
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
  if (!existsSync(join(__dirname, '.env'))) {
    console.warn('提示：未检测到 .env 文件，DeepSeek 调用将返回 500。请复制 .env.example 为 .env 并填入 DEEPSEEK_API_KEY。');
  }
});
