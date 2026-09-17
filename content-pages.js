// content-pages.js — 服务端渲染的静态内容页（SEO 用）
//
// 为什么需要它：原先整站是一个 SPA —— index.html 的 <main> 里全是空容器，
// 文字全靠 app.js 注入，而所有查询都走 POST /api/analyze，不产生任何 URL。
// 结果是搜索引擎（尤其百度/搜狗）拿不到可读内容，也没有可排名的落地页。
//
// 这里把已有的内容资产（25 条口语短语 + 20 篇入门短文）提升为「真实页面」：
//   /phrase/<slug>   一条短语一个页，标题即长尾问句
//   /read/<slug>     一篇文章一个页
// 同时负责动态生成 /robots.txt 与 /sitemap.xml（用请求 Host 推导域名，
// 将来绑定自定义域名无需改代码）。
//
// 约束：页面必须**不依赖 JS** 就能读到全部内容 —— 这是能被抓取的前提。
// 唯一用到 JS 的地方是「听发音」按钮，缺了也不影响内容可读性。

import { readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { READING_POOL } from './reading-pool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, 'public');

const SITE_NAME = '英语口语助手';
const SITE_SLOGAN = '地道口语翻译 · 近义词辨析';

// ══════════ 工具 ══════════

export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 英文 → URL slug。规则与 public/phrase-data.js 里写死的 slug 保持一致：
// 小写 → 去撇号（含弯引号）→ 连续非字母数字压成单个连字符 → 去首尾连字符。
function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc'`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

// JSON-LD 嵌在 <script> 里，必须先掐掉 </script> 的注入可能
function jsonld(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c').replace(/\u2028|\u2029/g, '');
}

// 取相邻的若干条，用于「相关表达」互链 —— 让内容页之间形成内部链接网
function neighbors(all, i, n = 5) {
  const out = [];
  for (let k = 1; out.length < n && k < all.length; k++) {
    const item = all[(i + k) % all.length];
    if (item && item.slug !== all[i].slug) out.push(item);
  }
  return out;
}

// ══════════ 数据索引（进程内建一次） ══════════

let _phrases = null;
let _phraseMtime = 0;

export function phrases() {
  const file = join(PUBLIC_DIR, 'phrase-data.js');
  let mtime = 0;
  try { mtime = statSync(file).mtimeMs; } catch { mtime = 0; }
  if (_phrases && mtime === _phraseMtime) return _phrases;

  let raw = [];
  try {
    const src = readFileSync(file, 'utf8');
    const sandbox = {};
    // phrase-data.js 是给浏览器用的 window.PHRASE_DATA = [...]，这里给它一个假 window
    new Function('window', src)(sandbox);
    raw = Array.isArray(sandbox.PHRASE_DATA) ? sandbox.PHRASE_DATA : [];
  } catch {
    raw = [];
  }

  const used = new Set();
  _phrases = raw.map((p, i) => {
    const base = p.slug || slugify(p.en) || `phrase-${i + 1}`;
    let slug = base;
    let n = 2;
    while (used.has(slug)) slug = `${base}-${n++}`;
    used.add(slug);
    return {
      cn: String(p.cn || ''),
      en: String(p.en || ''),
      slug,
      idx: i,
    };
  });
  _phraseMtime = mtime;
  return _phrases;
}

let _reads = null;

export function reads() {
  if (_reads) return _reads;
  const used = new Set();
  const out = [];
  READING_POOL.forEach((batch, bi) => {
    (Array.isArray(batch) ? batch : []).forEach((a, ai) => {
      if (!a || !a.title) return;
      const base = slugify(a.title) || `read-${bi + 1}-${ai + 1}`;
      let slug = base;
      let n = 2;
      while (used.has(slug)) slug = `${base}-${n++}`;
      used.add(slug);
      out.push({
        title: String(a.title),
        topic: String(a.topic || '日常'),
        body: String(a.body || ''),
        background: String(a.background || ''),
        reason: String(a.reason || ''),
        words: Array.isArray(a.words) ? a.words.map(String) : [],
        slug,
        batch: bi,
        idx: ai,
      });
    });
  });
  _reads = out;
  return _reads;
}

export function originOf(req) {
  const host = (req && req.headers && req.headers.host) || '';
  if (!host || /^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(host)) {
    return `http://${host || 'localhost:3000'}`;
  }
  return `https://${host}`;
}

// ══════════ 版式 ══════════

function layout({ title, description, canonical, ld, bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${esc(canonical)}" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="${esc(SITE_NAME)}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${esc(canonical)}" />
<meta name="twitter:card" content="summary" />
<link rel="stylesheet" href="/content.css" />
<script type="application/ld+json">${jsonld(ld)}</script>
</head>
<body>
<header class="hd">
  <a class="hd-brand" href="/">${esc(SITE_NAME)}</a>
  <span class="hd-slogan">${esc(SITE_SLOGAN)}</span>
</header>
<main class="wrap">
${bodyHtml}
</main>
<footer class="ft">
  <a href="/">← 打开 ${esc(SITE_NAME)}，查更多地道说法</a>
  <p class="ft-note">输入中文，立刻得到母语者真正会说的那句英语。</p>
</footer>
</body>
</html>
`;
}

// ══════════ 短语页 ══════════

export function renderPhrasePage(slug, origin) {
  const all = phrases();
  const p = all.find((x) => x.slug === slug);
  if (!p) return null;

  const canonical = `${origin}/phrase/${p.slug}`;
  const title = `「${p.cn}」用英语怎么说？地道说法是 ${p.en}`;
  const description =
    `中文「${p.cn}」的地道英文表达是 ${p.en} ` +
    `—— 不是逐字直译，而是母语者在同样场合真正会说的说法。附发音、相关表达与完整解析。`;

  const rel = neighbors(all, p.idx);
  const relHtml = rel
    .map(
      (r) =>
        `<li><a href="/phrase/${esc(r.slug)}"><span class="rel-en">${esc(r.en)}</span>` +
        `<span class="rel-cn">${esc(r.cn)}</span></a></li>`
    )
    .join('');

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: `「${p.cn}」用英语怎么说？`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `地道说法是：${p.en}`,
        },
      },
    ],
  };

  const bodyHtml = `  <p class="crumb"><a href="/">首页</a> / 地道口语</p>
  <h1>「${esc(p.cn)}」用英语怎么说？</h1>
  <p class="lead">母语者最常说的地道表达是：</p>
  <div class="ans">
    <p class="ans-en" lang="en">${esc(p.en)}</p>
    <button class="tts" type="button" data-text="${esc(p.en)}">听发音</button>
  </div>
  <p class="note">这句话不是逐字直译 —— 把中文一个字一个字对成英文，母语者会觉得别扭。上面这句才是他们在同样场合下真正会用的说法。</p>
  <a class="cta" href="/?q=${encodeURIComponent(p.cn)}">展开完整解析：用法、语气、替换说法 →</a>
  <section class="sec">
    <h2>相关表达</h2>
    <ul class="rel-list">${relHtml}</ul>
  </section>
  <script>
document.querySelectorAll('.tts').forEach(function (b) {
  b.addEventListener('click', function () {
    b.disabled = true;
    var a = new Audio('/api/tts?text=' + encodeURIComponent(b.dataset.text));
    a.addEventListener('ended', function () { b.disabled = false; });
    a.addEventListener('error', function () { b.disabled = false; });
    var done = function () { b.disabled = false; };
    a.play().then(done, done);
  });
});
  </script>`;

  return { html: layout({ title, description, canonical, ld, bodyHtml }), canonical, title };
}

// ══════════ 文章页 ══════════

export function renderReadPage(slug, origin) {
  const all = reads();
  const a = all.find((x) => x.slug === slug);
  if (!a) return null;

  const canonical = `${origin}/read/${a.slug}`;
  const title = `${a.title} — 入门英语短文（含翻译要点）`;
  const plain = a.body.replace(/\s+/g, ' ').trim();
  const description = `${a.title}：${plain.slice(0, 110)}…`;

  const paras = a.body
    .split(/\n{2,}/)
    .map((t) => `<p>${esc(t.trim())}</p>`)
    .join('\n    ');

  const wordsHtml = a.words.length
    ? `<section class="sec">
    <h2>重点词汇</h2>
    <ul class="words">${a.words.map((w) => `<li lang="en">${esc(w)}</li>`).join('')}</ul>
  </section>`
    : '';

  const rel = neighbors(all, all.indexOf(a));
  const relHtml = rel
    .map(
      (r) =>
        `<li><a href="/read/${esc(r.slug)}"><span class="rel-en">${esc(r.title)}</span>` +
        `<span class="rel-cn">${esc(r.topic)}</span></a></li>`
    )
    .join('');

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: a.title,
    inLanguage: 'en',
    about: a.topic,
    mainEntityOfPage: canonical,
    publisher: { '@type': 'Organization', name: SITE_NAME },
  };

  const bodyHtml = `  <p class="crumb"><a href="/">首页</a> / 入门英语短文</p>
  <p class="topic">${esc(a.topic)}</p>
  <h1 lang="en">${esc(a.title)}</h1>
  <article class="article" lang="en">
    ${paras}
  </article>
${a.background ? `  <section class="sec">\n    <h2>背景</h2>\n    <p>${esc(a.background)}</p>\n  </section>` : ''}
${a.reason ? `  <section class="sec">\n    <h2>为什么适合练</h2>\n    <p>${esc(a.reason)}</p>\n  </section>` : ''}
${wordsHtml}
  <a class="cta" href="/">用 ${esc(SITE_NAME)} 读更多短文、练地道口语 →</a>
  <section class="sec">
    <h2>其他短文</h2>
    <ul class="rel-list">${relHtml}</ul>
  </section>`;

  return { html: layout({ title, description, canonical, ld, bodyHtml }), canonical, title };
}

// ══════════ robots.txt / sitemap.xml ══════════

export function renderRobots(origin) {
  return [
    'User-agent: *',
    'Allow: /',
    '',
    '# 接口不参与索引',
    'Disallow: /api/',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');
}

// lastmod 取内容文件的真实 mtime：写成「今天」等于宣称全站每天都变，
// 搜索引擎会把这种 sitemap 当噪声，反而降低抓取优先级。
function contentLastmod() {
  let ms = 0;
  for (const f of [join(PUBLIC_DIR, 'phrase-data.js'), join(__dirname, 'reading-pool.js')]) {
    try { ms = Math.max(ms, statSync(f).mtimeMs); } catch { /* 文件缺失则忽略 */ }
  }
  return new Date(ms || Date.now()).toISOString().slice(0, 10);
}

export function renderSitemap(origin) {
  const today = contentLastmod();
  const urls = [
    { loc: '/', priority: '1.0', freq: 'weekly' },
    ...phrases().map((p) => ({ loc: `/phrase/${p.slug}`, priority: '0.8', freq: 'monthly' })),
    ...reads().map((r) => ({ loc: `/read/${r.slug}`, priority: '0.6', freq: 'monthly' })),
  ];

  const body = urls
    .map(
      (u) => `  <url>
    <loc>${esc(origin + u.loc)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${u.freq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

// ══════════ 首页（SPA 外壳）的 SEO 注入 ══════════
//
// 首页仍然是 SPA，但做两件事让爬虫至少拿到「这是什么站 + 有哪些页面」：
//   1. 注入完整 head（description / og / canonical / JSON-LD）
//   2. 把前几条热门短语**预渲染成真实的 <a> 链接**，让爬虫不执行 JS 也能发现内容页

export function renderIndexHead(origin) {
  const title = `${SITE_NAME} · 地道口语翻译 & 近义词辨析`;
  const description =
    '英语口语助手：输入中文，立刻得到母语者真正会说的那句地道英语 —— ' +
    '支持口语翻译、近义词辨析、真人发音、入门英语短文与收藏复习。附常用中文口语的地道英文说法。';
  const canonical = `${origin}/`;

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: SITE_NAME,
    alternateName: `${SITE_NAME} · 地道口语翻译`,
    description,
    url: canonical,
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Web',
    inLanguage: ['zh-CN', 'en'],
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'CNY' },
  };

  return `  <meta name="description" content="${esc(description)}" />
  <meta name="robots" content="index,follow" />
  <link rel="canonical" href="${esc(canonical)}" />
  <meta name="theme-color" content="#1E63D0" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="${esc(SITE_NAME)}" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:url" content="${esc(canonical)}" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(description)}" />
  <script type="application/ld+json">${jsonld(ld)}</script>`;
}

// 与 app.js 的 renderPhrases() 输出同构 —— app 启动后会用相同内容覆盖，
// 所以用户不会看到闪动，而爬虫在不执行 JS 的情况下也能读到这些链接。
export function renderPopularHtml(n = 5) {
  return phrases()
    .slice(0, n)
    .map(
      (p) =>
        `<a class="pop-item" href="/phrase/${esc(p.slug)}" data-phrase="${esc(p.cn)}">` +
        `<div class="pi-en" lang="en">${esc(p.en)}</div>` +
        `<div class="pi-cn">${esc(p.cn)}</div></a>`
    )
    .join('');
}
