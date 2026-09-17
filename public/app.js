// app.js — 英语口语助手 前端交互
// 三个 tab：首页（口语翻译 / 近义词查询）· 阅读 · 收藏
const $ = (s) => document.querySelector(s);
const stateInput = $('#state-input');
const stateLoading = $('#state-loading');
const stateResult = $('#state-result');
const stateReading = $('#state-reading');
const stateFav = $('#state-fav');
const stateReview = $('#state-review');
const qEl = $('#q');
const goBtn = $('#go');
const tipEl = $('#tip');
const counterEl = $('#counter');
const recentList = $('#recent');
const popEl = $('#popList');
const readList = $('#readList');
const favList = $('#favList');
const backBtn = $('#backBtn');
const loadingText = $('#loadingText');
const tabHome = $('#tabHome');
const tabRead = $('#tabRead');
const tabFav = $('#tabFav');

const RECENT_KEY = 'ms_recent';
const FAV_KEY = 'ms_favorites';
// 阅读文章的本地缓存。服务端生成一批 5 篇要走 1~2 轮 DeepSeek（最坏 20~40s），
// 所以打开首页就先预取一次；缓存命中时连预取都不用发，直接秒开。
// TTL 取 30 分钟：短文内容是通用素材，半小时内没必要重新生成。（与小程序同口径）
const READ_KEY = 'ms_reading';
const READ_TTL = 30 * 60 * 1000;
const REVIEW_DAYS = [1, 2, 4, 7, 15];
const CN_RE = /[\u3400-\u4dbf\u4e00-\u9fff]/;
const CN_RE_G = /[\u3400-\u4dbf\u4e00-\u9fff]/g;
// 是否含英文字母（用于区分「整句英文」与其他非中文输入）
const EN_RE = /[A-Za-z]/;
// 日文假名 / 韩文谚文
const KANA_HANGUL_RE = /[\u3040-\u30ff\uac00-\ud7af]/g;
const SPEAKER = '<svg class="sp-ico" viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>';
const ACCENTS = ['var(--blue)', 'var(--green)', 'var(--orange)'];

// ---------- 状态 ----------
let mode = 'colloquial';      // 'colloquial' | 'synonym'
let currentTab = 'home';      // 'home' | 'read' | 'fav'
let queryView = 'input';      // 首页内部子视图：'input' | 'loading' | 'result'
let favView = 'list';         // 收藏内部子视图：'list' | 'review'

let currentInput = '';
let currentData = null;
let currentKind = 'synonym';

// 请求序号：每次 run() 自增，响应回来时比对，丢弃被后续请求取代的过期响应。
// 与小程序 pages/index/index.js 的 _reqSeq 同一套做法。
let reqSeq = 0;

let favCache = [];
let reviewList = [];
let reviewIdx = 0;

let popPage = 0;
let readPage = 0;
let readArticles = [];
let readLoading = false;
let readSource = '';
let expandedRead = new Set();
let readInflight = false;     // 阅读请求并发闸：同一时刻只允许一路

const MAXLEN = { colloquial: 200, synonym: 100 };
const PLACEHOLDER = {
  colloquial: '输入中文，即刻翻译地道口语',
  synonym: '输入单词，多个单词用空格隔开',
};

// ---------- 工具 ----------
function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
  }[c]));
}

function setTip(msg, kind = '') {
  tipEl.textContent = msg ? '⚠ ' + msg : '';
  tipEl.style.display = msg ? 'block' : 'none';
  tipEl.dataset.kind = msg ? kind : '';
}

// ---------- 输入校验（与后端 validate.js 同一套规则） ----------
// 口语翻译：只支持「纯中文」与「中英混合」；完全不含中文时，含英文字母 →
// 「抱歉，目前暂时不支持英翻中」，其他（如纯日文假名）→ 「请输入中文，口语翻译只支持中文」
function validate(raw, m) {
  const s = (raw || '').trim();
  if (m === 'colloquial') {
    if (!s) return '请输入要翻译的中文';
    // 语言性错误优先于长度报错
    if (!CN_RE.test(s)) return EN_RE.test(s) ? '抱歉，目前暂时不支持英翻中' : '请输入中文，口语翻译只支持中文';
    const len = [...s].length;
    if (len > 200) return `最多支持 200 个字符，当前 ${len} 个字符`;
    const cn = (s.match(CN_RE_G) || []).length;
    const cjk = (s.match(KANA_HANGUL_RE) || []).length;
    if (cjk > 0 && cjk >= cn) return '请输入中文，口语翻译只支持中文';
    return '';
  }
  if (!s) return '请输入要查询的单词';
  if ([...s].length > 100) return '暂不支持超过100个字符的长度';
  if (CN_RE.test(s)) return '不支持中文输入';
  return '';
}

// ---------- 输入框 ----------
function updateCounter() {
  const max = MAXLEN[mode];
  const len = [...qEl.value.trim()].length;
  counterEl.textContent = `${len}/${max}`;
  const over = len > max;
  counterEl.classList.toggle('over', over);
  // 超限即时提示（不覆盖其他类型的错误提示）
  if (over) setTip(`最多支持 ${max} 个字符，当前 ${len} 个字符`, 'over');
  else if (tipEl.dataset.kind === 'over') setTip('');
}
function setMode(next, { keepValue = true } = {}) {
  mode = next;
  document.querySelectorAll('.mode-opt').forEach((el) => {
    el.classList.toggle('active', el.dataset.mode === next);
  });
  // 口语模式不设 maxlength：由计数器 + 实时提示把关，超限提示才真正可达；
  // 近义词模式保持原 100 字符硬上限（规则不变）
  if (next === 'colloquial') qEl.removeAttribute('maxlength');
  else qEl.setAttribute('maxlength', String(MAXLEN[next]));
  qEl.setAttribute('placeholder', PLACEHOLDER[next]);
  if (!keepValue) qEl.value = '';
  setTip('');
  updateCounter();
}

// ---------- 视图切换 ----------
function paintTab() {
  tabHome.classList.toggle('active', currentTab === 'home');
  tabRead.classList.toggle('active', currentTab === 'read');
  tabFav.classList.toggle('active', currentTab === 'fav');

  stateInput.classList.toggle('hidden', !(currentTab === 'home' && queryView === 'input'));
  stateLoading.classList.toggle('hidden', !(currentTab === 'home' && queryView === 'loading'));
  stateResult.classList.toggle('hidden', !(currentTab === 'home' && queryView === 'result'));
  stateReading.classList.toggle('hidden', currentTab !== 'read');
  stateFav.classList.toggle('hidden', !(currentTab === 'fav' && favView === 'list'));
  stateReview.classList.toggle('hidden', !(currentTab === 'fav' && favView === 'review'));

  const showBack = (currentTab === 'home' && queryView === 'result') || (currentTab === 'fav' && favView === 'review');
  backBtn.classList.toggle('hidden', !showBack);
}

function showTab(tab) {
  currentTab = tab;
  // 幂等：预取已经拿过就走缓存/已就绪分支立即返回；
  // 上一次预取失败（无文章、无在途请求）时，这里会重试一次。
  if (tab === 'read') prefetchReading();
  if (tab === 'fav') renderFavList();
  paintTab();
}

// ---------- 查询 ----------
async function run(forced) {
  const input = (forced != null ? String(forced) : qEl.value).trim();
  // 场景必须在 await 之前捕获：mode 是全局变量，setMode() / openFavItem() / onRecentTap()
  // 都会在请求在途时改掉它。此前 currentKind = mode 写在两次 await 之后，
  // 用户若中途切了场景，就会出现「currentData 是 A 类结果、currentKind 标成 B 类」
  // —— 收藏归类与分享长图都读 currentKind，会被打歪（画面本身按 data.mode 分流，不受影响）。
  const reqKind = mode;
  const seq = ++reqSeq;

  const v = validate(input, reqKind);
  // 超限类提示打上 kind，输入字数回落时才会自动消失（否则会一直挂着）
  if (v) { setTip(v, /最多支持 \d+ 个字符/.test(v) ? 'over' : ''); return; }
  setTip('');
  if (forced == null) qEl.value = input;

  queryView = 'loading';
  loadingText.textContent = reqKind === 'colloquial' ? '翻译中…' : '查询中…';
  paintTab();
  screenTop();

  // 这次响应是否还该生效。返回 true 表示作废。
  // 注意两种作废要区别对待：序号被取代时**什么都别动** —— 更新的那个请求正在跑、
  // 且已经设过 loading，动视图会把它的转圈打掉（连点两次 GO 会闪）。只有「序号仍最新、
  // 但用户切了场景」才需要自己收尾，否则会卡在 loading。
  const stale = () => {
    if (seq !== reqSeq) return true;
    if (reqKind !== mode) {
      if (queryView === 'loading') { queryView = 'input'; paintTab(); }
      return true;
    }
    return false;
  };

  try {
    const resp = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input, kind: reqKind }),
    });
    const data = await resp.json();
    if (stale()) return;
    if (!resp.ok) throw new Error(data.error || '请求失败');
    currentInput = input;
    currentData = data;
    currentKind = reqKind;
    renderResult(data, stateResult);
    pushRecent(input, reqKind, data);
    queryView = 'result';
  } catch (e) {
    if (stale()) return;
    queryView = 'input';
    setTip(e.message || '服务暂时不可用');
  }
  paintTab();
}

function screenTop() {
  const sc = document.getElementById('screen');
  if (sc) sc.scrollTop = 0;
}

// ══════════ 渲染：近义词（规则与呈现保持不变） ══════════
function wordCard(w, accent) {
  const ex = (w.examples || []).map((e, i) => `
    <div class="ex">
      <div class="ex-en">例${i + 1}: ${esc(e.en)}</div>
      <div class="ex-cn">${esc(e.cn)}</div>
    </div>`).join('');
  return `
    <div class="word-card" style="--accent:${accent}">
      <div class="wc-head">
        <span class="wc-word">${esc(w.word)}</span>
        <span class="wc-phon">${esc(w.phonetic)}</span>
        <button class="wc-speak" data-say="${esc(w.word)}" title="英式发音" aria-label="英式发音">${SPEAKER}</button>
        <span class="wc-pos">${esc(w.pos)}</span>
      </div>
      <div class="wc-cn">${esc(w.cn_meaning)}</div>
      <div class="wc-usage">${esc(w.usage)}</div>
      <div class="wc-examples">${ex}</div>
    </div>`;
}

function renderSingle(data, target) {
  const p = data.primary || {};
  const syn = (data.synonyms || []).map((w) => wordCard(w, 'var(--green)')).join('');
  const a = data.analysis || {};

  const qc = (a.quick_compare || []).map((x) => `
    <div class="qc-row"><span class="qc-word">${esc(x.word)}</span><span class="qc-point">${esc(x.point)}</span></div>`).join('');

  const ce = (a.contrast_examples || []).map((c) => {
    const ss = (c.sentences || []).map((s) => `
      <div class="ce-line"><b>${esc(s.word)}</b> ${esc(s.en)} <span class="ce-cn">${esc(s.cn)}</span></div>`).join('');
    return `<div class="ce-block"><div class="ce-scenario">${esc(c.scenario)}</div>${ss}</div>`;
  }).join('');

  const eu = (a.exclusive_usage || []).map((x) => `
    <div class="eu-row">
      <div class="eu-tag">只用 ${esc(x.use_only)}</div>
      <div class="eu-ok">✓ ${esc(x.en)} <span class="ex-cn">${esc(x.cn)}</span></div>
      <div class="eu-bad">✗ ${esc(x.wrong)}</div>
      <div class="eu-rule">${esc(x.rule)}</div>
    </div>`).join('');

  const synCount = (data.synonyms || []).length;
  target.innerHTML = `
    <div class="result-scroll">
      <div class="result-summary"><span class="rs-text">${esc(p.word)}单词有${synCount}个近义词</span><span class="rs-btns">${favBtnHtml()}<button class="share-img-btn" data-act="share">分享</button></span></div>
      ${wordCard(p, 'var(--blue)')}
      <div class="syn-title">同义词</div>
      ${syn}
      <div class="analysis">
        <div class="an-title">差异辨析</div>
        <div class="an-sub">双列速览</div>
        <div class="qc">${qc}</div>
        <div class="an-sub">对照例句</div>
        ${ce}
        <div class="an-sub">互换性判断</div>
        ${eu}
        <div class="an-summary">${esc(a.summary)}</div>
      </div>
    </div>`;
}

function renderMulti(data, target) {
  const words = (data.words || []).map((w, i) => wordCard(w, ACCENTS[i % ACCENTS.length])).join('');
  const a = data.analysis || {};
  const ot = a.overall_table || {};
  const dims = ot.dimensions || [];
  const thead = `<tr><th>单词</th>${dims.map((d) => `<th>${esc(d)}</th>`).join('')}</tr>`;
  const rows = (ot.rows || []).map((r) => {
    const cells = (r.cells || []).map((c) => `<td>${esc(c)}</td>`).join('');
    return `<tr><td class="cell-word">${esc(r.word)}</td>${cells}</tr>`;
  }).join('');

  const exclusive = (a.exclusive || []).map((x) => {
    const ex = (x.examples || []).map((e) => `
      <div class="ex-uniq">
        <div class="ex-en">${esc(e.en)} <span class="ex-cn">${esc(e.cn)}</span></div>
        <div class="ex-note">${esc(e.note)}</div>
      </div>`).join('');
    return `<div class="uniq-block"><div class="uniq-title">只能用 ${esc(x.word)}</div>${ex}</div>`;
  }).join('');

  const wCount = (data.words || []).length;
  target.innerHTML = `
    <div class="result-scroll">
      <div class="result-summary"><span class="rs-text">本次一共对比${wCount}个单词</span><span class="rs-btns">${favBtnHtml()}<button class="share-img-btn" data-act="share">分享</button></span></div>
      ${words}
      <div class="analysis">
        <div class="an-title">整体对比</div>
        <div class="table-wrap"><table class="cmp-table">${thead}${rows}</table></div>
        <div class="an-title">各自独有用法</div>
        ${exclusive}
        <div class="an-summary">${esc(a.summary)}</div>
      </div>
    </div>`;
}

// ══════════ 渲染：口语翻译（三部分） ══════════
function sentRow(en, cn, extraClass = '') {
  return `
    <div class="sent ${extraClass}">
      <div class="sent-body">
        <div class="sent-en">${esc(en)}</div>
        ${cn ? `<div class="sent-cn">${esc(cn)}</div>` : ''}
      </div>
      <button class="sent-tail" data-say="${esc(en)}" aria-label="朗读">${SPEAKER}</button>
    </div>`;
}

function renderColloquial(data, target) {
  const zh = data.zh || currentInput || '';
  const examples = (data.examples || []).slice(0, 3);
  const points = (data.key_points || []).slice(0, 5);
  const scenes = (data.scenes || []).slice(0, 3);

  const exHtml = examples.map((e) => sentRow(e.en, e.cn)).join('');

  const kpHtml = points.map((k) => {
    const isWord = (k.kind || '').toLowerCase() === 'word';
    return `
      <div class="kp">
        <div class="kp-head">
          <span class="kp-term">${esc(k.term)}</span>
          <span class="kp-kind ${isWord ? 'k-word' : ''}">${isWord ? '单词' : '短语'}</span>
          ${k.phonetic ? `<span class="kp-phon">${esc(k.phonetic)}</span>` : ''}
          <button class="kp-speak" data-say="${esc(k.term)}" aria-label="朗读">${SPEAKER}</button>
        </div>
        ${k.cn ? `<div class="kp-cn">${esc(k.cn)}</div>` : ''}
        ${k.note ? `<div class="kp-note">${esc(k.note)}</div>` : ''}
      </div>`;
  }).join('');

  const sceneHtml = scenes.map((s) => `
    <div class="scene">
      <span class="scene-tag">${esc(s.scene)}</span>
      <div class="sent-en">${esc(s.en)}</div>
      ${s.cn ? `<div class="sent-cn">${esc(s.cn)}</div>` : ''}
      <div style="text-align:right">
        <button class="sent-tail" data-say="${esc(s.en)}" aria-label="朗读">${SPEAKER}</button>
      </div>
    </div>`).join('');

  target.innerHTML = `
    <div class="result-scroll">
      <div class="result-summary"><span class="rs-text">地道口语翻译</span><span class="rs-btns">${favBtnHtml()}<button class="share-img-btn" data-act="share">分享</button></span></div>

      <div class="col-hero">
        <div class="col-hero-label">中文 · ${esc(zh)}</div>
        <div class="col-main">
          <span class="col-text">${esc(data.translation || '')}</span>
          <button class="sent-tail" data-say="${esc(data.translation || '')}" aria-label="朗读">${SPEAKER}</button>
        </div>
        ${data.literal ? `<div class="col-literal"><b>直译对照：</b>${esc(data.literal)}</div>` : ''}
      </div>

      <div class="col-sec">
        <div class="col-sec-title">地道例句</div>
        <div class="col-sec-sub">点句子右侧喇叭可朗读</div>
        ${exHtml}
      </div>

      ${kpHtml ? `
      <div class="col-sec">
        <div class="col-sec-title">重点词汇与短语</div>
        <div class="col-sec-sub">上面例句里最值得记住的用法</div>
        ${kpHtml}
      </div>` : ''}

      ${sceneHtml ? `
      <div class="col-sec">
        <div class="col-sec-title">还能用在这些场景</div>
        <div class="col-sec-sub">换个场合怎么说</div>
        ${sceneHtml}
      </div>` : ''}

      ${data.tip ? `<div class="col-tip"><b>提醒：</b>${esc(data.tip)}</div>` : ''}
    </div>`;
}

function renderResult(data, target) {
  target = target || stateResult;
  if (data.mode === 'colloquial') return renderColloquial(data, target);
  if (data.mode === 'multi') return renderMulti(data, target);
  return renderSingle(data, target);
}

// ══════════ 发音（服务端 TTS 代理，失败回退浏览器合成） ══════════
let _audio = null;
function clearPlaying() {
  document.querySelectorAll('.playing').forEach((el) => el.classList.remove('playing'));
}
function speakFallback(text) {
  if (!('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-GB';
    u.rate = 0.9;
    const v = (speechSynthesis.getVoices() || []).find((vv) => /en[-_]GB/i.test(vv.lang) || /British|UK/i.test(vv.name));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  } catch { /* 忽略 */ }
}
function speak(text, btn) {
  const t = String(text || '').trim();
  if (!t) return;
  try { if (_audio) { _audio.pause(); _audio = null; } } catch { /* 忽略 */ }
  clearPlaying();
  if (btn) btn.classList.add('playing');

  const a = new Audio('/api/tts?text=' + encodeURIComponent(t));
  _audio = a;
  const done = () => { if (btn) btn.classList.remove('playing'); };
  a.addEventListener('ended', done);
  a.addEventListener('error', () => { done(); speakFallback(t); });
  const p = a.play();
  if (p && p.catch) p.catch(() => { done(); speakFallback(t); });
}
if ('speechSynthesis' in window) {
  speechSynthesis.getVoices();
  speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
}

// ══════════ 收藏 / 复习 ══════════
function loadFavs() {
  try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); }
  catch { return []; }
}
function persistFavs() {
  try { localStorage.setItem(FAV_KEY, JSON.stringify(favCache.slice(0, 200))); } catch { /* 超限忽略 */ }
}
function isFav(input, kind) {
  return favCache.some((r) => r.input === input && (r.kind || 'synonym') === kind);
}
function favBtnHtml() {
  const on = isFav(currentInput, currentKind);
  return `<button class="fav-btn ${on ? 'on' : ''}" data-act="fav">${on ? '★ 已收藏' : '☆ 收藏'}</button>`;
}
function toggleFav() {
  if (!currentInput || !currentData) return;
  if (isFav(currentInput, currentKind)) {
    favCache = favCache.filter((r) => !(r.input === currentInput && (r.kind || 'synonym') === currentKind));
    toast('已取消收藏');
  } else {
    favCache = favCache.filter((r) => !(r.input === currentInput && (r.kind || 'synonym') === currentKind));
    favCache.unshift({
      input: currentInput, kind: currentKind, data: currentData,
      level: 0,
      nextReview: Date.now() + REVIEW_DAYS[0] * 864e5,
      createdAt: Date.now(), updatedAt: Date.now(),
    });
    toast('已加入收藏');
  }
  persistFavs();
  updateFavBtn();
  renderFavList();
  renderFavDot();
}
function updateFavBtn() {
  const btn = document.querySelector('#state-result .fav-btn');
  if (!btn) return;
  const on = isFav(currentInput, currentKind);
  btn.className = 'fav-btn' + (on ? ' on' : '');
  btn.textContent = on ? '★ 已收藏' : '☆ 收藏';
}
function dueCount() {
  const now = Date.now();
  return favCache.filter((r) => (r.nextReview || 0) <= now).length;
}
function renderFavDot() {
  const existing = document.querySelector('#tabFav .tab-dot');
  const n = dueCount();
  if (existing) existing.remove();
  if (n > 0) {
    const d = document.createElement('span');
    d.className = 'tab-dot';
    d.textContent = n > 99 ? '99+' : String(n);
    tabFav.appendChild(d);
  }
}
function renderFavList() {
  if (!favList) return;
  if (!favCache.length) {
    favList.innerHTML = '<div class="lib-empty">还没有收藏。查询后点结果页的「☆ 收藏」，就能在这里复习。</div>';
  } else {
    favList.innerHTML = favCache.map((r, i) => `
      <div class="lib-item" data-fav="${i}">
        <div class="lib-title">${esc(favTitle(r))}</div>
        <div class="lib-sub">${esc(favSub(r))}</div>
      </div>`).join('');
  }
  const badge = document.getElementById('reviewBadge');
  if (badge) badge.textContent = String(dueCount());
  const rev = document.getElementById('favReview');
  if (rev) rev.style.display = favCache.length ? 'block' : 'none';
  renderFavDot();
}
function favTitle(r) {
  if ((r.kind || 'synonym') === 'colloquial') return r.input;
  return titleOf(r.data);
}
function favSub(r) {
  if ((r.kind || 'synonym') === 'colloquial') {
    const t = (r.data && r.data.translation) || '';
    const lv = REVIEW_DAYS[r.level || 0];
    return `口语 · ${t} · ${lv}天后再复习`;
  }
  return subOf(r.data);
}
function titleOf(d) {
  if (!d) return '';
  if (d.mode === 'multi') return (d.words || []).map((w) => w.word).join(' / ');
  const p = d.primary || {};
  const syns = (d.synonyms || []).map((w) => w.word).join(', ');
  return p.word + (syns ? ' → ' + syns : '');
}
function subOf(d) {
  if (!d) return '';
  if (d.mode === 'multi') return '对比 ' + (d.words || []).length + ' 个单词';
  return (d.primary && d.primary.cn_meaning || '') + ' · 有 ' + (d.synonyms || []).length + ' 个近义词';
}

function openFavItem(idx) {
  const r = favCache[idx];
  if (!r) return;
  currentInput = r.input;
  currentData = r.data;
  currentKind = r.kind || 'synonym';
  mode = currentKind;
  qEl.value = r.input;
  setMode(currentKind);
  renderResult(r.data, stateResult);
  queryView = 'result';
  showTab('home');
}

// ---------- 复习 ----------
function showReview() {
  const now = Date.now();
  const due = favCache.filter((r) => (r.nextReview || 0) <= now).slice(0, 30);
  if (!due.length) { toast('暂无待复习'); return; }
  reviewList = due;
  reviewIdx = 0;
  favView = 'review';
  renderReviewCard();
  paintTab();
  screenTop();
}
function renderReviewCard() {
  const rec = reviewList[reviewIdx];
  if (!rec) { finishReview(); return; }
  currentInput = rec.input;
  currentData = rec.data;
  currentKind = rec.kind || 'synonym';
  renderResult(rec.data, stateReview);
  const bar = `<div class="review-head">
      <div class="review-progress">复习进度 ${reviewIdx + 1} / ${reviewList.length}</div>
      <div class="review-word">${esc(rec.input)}</div>
    </div>
    <div class="review-actions">
      <button class="rev-btn forget" data-act="r-forget">忘了 ✗</button>
      <button class="rev-btn remember" data-act="r-remember">记得 ✓</button>
    </div>`;
  stateReview.insertAdjacentHTML('afterbegin', bar);
  clearPlaying();
}
function advanceReview(remembered) {
  const rec = reviewList[reviewIdx];
  if (!rec) return;
  let level = rec.level || 0;
  level = remembered ? Math.min(level + 1, REVIEW_DAYS.length - 1) : 0;
  rec.level = level;
  rec.nextReview = Date.now() + REVIEW_DAYS[level] * 864e5;
  rec.updatedAt = Date.now();
  const idx = favCache.findIndex((r) => r.input === rec.input && (r.kind || 'synonym') === (rec.kind || 'synonym'));
  if (idx >= 0) favCache[idx] = rec;
  persistFavs();
  reviewIdx += 1;
  if (reviewIdx >= reviewList.length) finishReview();
  else { renderReviewCard(); screenTop(); }
}
function finishReview() {
  const total = reviewList.length;
  stateReview.innerHTML = `<div class="review-done">
      <div class="rd-emoji">🎉</div>
      <div class="rd-title">本轮复习完成</div>
      <div class="rd-sub">共复习 ${total} 项</div>
      <button class="rev-btn remember wide" data-act="r-back">返回收藏</button>
    </div>`;
  reviewList = [];
  reviewIdx = 0;
  renderFavList();
}

// ══════════ 最近查询 ══════════
// 展示规则：总数最多 5 条，其中「口语翻译」最多占 2 条
function getRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); }
  catch { return []; }
}
function pushRecent(input, kind, data) {
  const arr = getRecent().filter((x) => !(x.input === input && (x.kind || 'synonym') === kind));
  arr.unshift({ input, kind, data, at: Date.now() });
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(arr.slice(0, 12))); } catch { /* 超限忽略 */ }
  renderRecent();
}
function visibleRecent() {
  const out = [];
  let colCount = 0;
  for (const r of getRecent()) {
    if (out.length >= 5) break;
    if ((r.kind || 'synonym') === 'colloquial') {
      if (colCount >= 2) continue;
      colCount += 1;
    }
    out.push(r);
  }
  return out;
}
function renderRecent() {
  const arr = visibleRecent();
  if (!arr.length) {
    recentList.innerHTML = '<div class="recent-empty">还没有查询记录，试试上面的热门短语</div>';
    return;
  }
  recentList.innerHTML = arr.map((r, i) => {
    const isCol = (r.kind || 'synonym') === 'colloquial';
    const main = isCol ? r.input : titleOf(r.data);
    const sub = isCol ? ((r.data && r.data.translation) || '') : subOf(r.data);
    return `<div class="recent-item" data-recent="${i}">
      <div class="ri-main"><span class="ri-tag ${isCol ? 't-col' : 't-syn'}">${isCol ? '口语' : '近义词'}</span>${esc(main)}</div>
      ${sub ? `<div class="ri-sub">${esc(sub)}</div>` : ''}
    </div>`;
  }).join('');
}

// ══════════ 热门短语 ══════════
function renderPhrases() {
  const all = window.PHRASE_DATA || [];
  if (!all.length) { popEl.innerHTML = '<div class="recent-empty">暂无数据</div>'; return; }
  const size = Math.min(5, all.length);
  const start = (popPage * size) % all.length;
  const page = [];
  for (let i = 0; i < size; i++) page.push(all[(start + i) % all.length]);
  // 输出真 <a> 而不是 <div>：让爬虫不执行 JS 也能顺着链接发现 /phrase/<slug> 内容页。
  // 点击仍由下方事件委托接管（preventDefault + 填入输入框），人类用户感受不到差别；
  // 想开新窗口看内容页，中键/长按即可，走的还是真链接。
  popEl.innerHTML = page.map((p) => {
    const href = p.slug ? ` href="/phrase/${esc(p.slug)}"` : '';
    return `
    <a class="pop-item"${href} data-phrase="${esc(p.cn)}">
      <div class="pi-en">${esc(p.en)}</div>
      <div class="pi-cn">${esc(p.cn)}</div>
    </a>`;
  }).join('');
}

// ══════════ 阅读 ══════════

// 幂等预取：打开首页 / 切到阅读 tab 时都调这里。
// 三种情况直接返回，不发请求：已有文章、请求在途、本地缓存命中。
function prefetchReading() {
  if (readInflight) return;
  if (readArticles.length) return;
  if (readFromCache()) return;
  loadReading(0);
}

// 读本地缓存。命中则直接可用（0 网络延迟），返回 true。
function readFromCache() {
  try {
    const c = JSON.parse(localStorage.getItem(READ_KEY) || 'null');
    if (!c || !c.articles || !c.articles.length) return false;
    if (Date.now() - (c.at || 0) > READ_TTL) return false;
    readArticles = c.articles;
    readPage = c.page || 0;
    readSource = c.source || '';
    readLoading = false;
    expandedRead = new Set();
    renderReading();
    return true;
  } catch {
    return false;   // 缓存坏了就当作没有，走网络
  }
}

function saveReadingCache() {
  try {
    localStorage.setItem(READ_KEY, JSON.stringify({
      page: readPage, source: readSource, at: Date.now(),
      // body / words 就够渲染，派生字段（长度、段落、展开态）一律不入库
      articles: readArticles.map((a) => ({
        topic: a.topic, title: a.title, body: a.body,
        words: a.words, background: a.background, reason: a.reason,
      })),
    }));
  } catch { /* 存储超限或隐私模式：不影响主流程 */ }
}

async function loadReading(page) {
  // 并发闸：预取在途时用户又点了「阅读」/「换一批」，不该再发一路
  if (readInflight) return;
  readInflight = true;
  readLoading = true;
  readSource = '';
  if (!readArticles.length) readList.innerHTML = '<div class="sk-card"></div><div class="sk-card"></div><div class="sk-card"></div>';
  try {
    const resp = await fetch('/api/reading?page=' + page);
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || '加载失败');
    readArticles = data.articles || [];
    readPage = data.page != null ? data.page : page;
    readSource = data.source || '';
  } catch (e) {
    readArticles = [];
    readList.innerHTML = `<div class="lib-empty">文章加载失败：${esc(e.message || '请稍后再试')}</div>`;
    readLoading = false;
    return;
  } finally {
    readInflight = false;
  }
  readLoading = false;
  expandedRead = new Set();
  // 落盘：下次打开页面直接命中，省一次 20~40s 的生成
  saveReadingCache();
  renderReading();
}
function renderReading() {
  if (readLoading) return;
  if (!readArticles.length) {
    readList.innerHTML = '<div class="lib-empty">暂时没有文章，点「换一批」重试</div>';
    return;
  }
  readList.innerHTML = readArticles.map((a, i) => {
    const open = expandedRead.has(i);
    const paras = String(a.body || '').split('\n\n').map((p) => `<p>${esc(p)}</p>`).join('');
    const words = (a.words || []).map((w) => `<span class="rc-word" data-word="${esc(w)}">${esc(w)}</span>`).join('');
    return `
      <div class="read-card">
        <div class="rc-top">
          <span class="rc-topic">${esc(a.topic || '阅读')}</span>
          <span class="rc-len">${(a.body || '').length} 字符</span>
        </div>
        <div class="rc-title">${esc(a.title)}</div>
        ${a.background ? `<div class="rc-sub"><span class="rc-sub-label">背景 · </span>${esc(a.background)}</div>` : ''}
        ${a.reason ? `<div class="rc-reason">推荐 · ${esc(a.reason)}</div>` : ''}
        ${words ? `<div class="rc-words">${words}</div>` : ''}
        <div class="rc-toggle" data-read="${i}">${open ? '收起 ▲' : '点击展开阅读 ▼'}</div>
        ${open ? `<div class="rc-body">${paras}</div>` : ''}
      </div>`;
  }).join('');
}

// ══════════ 分享 ══════════
// 分享标题：**全场景统一一句固定口号**（2026-09-16 定稿，与小程序同源）。
// 不分口语/近义、不分有无结果 —— 此前按场景分两句，线上实拍过「模式与文案对不上」，索性收敛为一句。
// 不判断任何状态：无需区分 mode / currentKind，也就不会再踩 currentKind 初值写死 'synonym' 那个坑。
function shareTitle() {
  return '地道英语就用英语口语助手';
}

// 分享长图用的「内容标题」，只在近义长图上渲染（口语长图不渲染标题）。
// 与分享标题解耦：长图是海报，标题带具体词才有上下文。行为与改造前逐字一致。
function resultCaption() {
  const d = currentData;
  if (!d) return '英语口语助手：近义词辨析';
  let words = [];
  if (d.mode === 'multi') words = (d.words || []).map((w) => w.word);
  else {
    const p = (d.primary && d.primary.word) || '';
    const syns = (d.synonyms || []).map((w) => w.word);
    words = [p].concat(syns);
  }
  words = words.filter(Boolean);
  if (!words.length) words = [(currentInput || '').trim()].filter(Boolean);
  if (!words.length) return '英语口语助手：近义词辨析';
  const core = words.length <= 2 ? words.join('、') : (words.slice(0, 2).join('、') + '等');
  return '英语口语助手：' + core + '的差异';
}

function buildShareUrl() {
  const s = (currentInput || '').trim();
  if (!s) return 'https://misspompei.onrender.com/';
  const p = new URLSearchParams({ q: s });
  if (currentKind === 'colloquial') p.set('k', 'c');
  return 'https://misspompei.onrender.com/?' + p.toString();
}

// 圆角 logo：纯渐变方块，不落单字。
// 原先方块里写死白色「词」字（「单词助手」时期字形），与紧邻的「英语口语助手」自相矛盾；
// 而口语/近义两个场景共用同一块品牌位，任何单字都偏袒一边，故留白。
function drawLogo(ctx, x, y, size) {
  const r = size * 0.25;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + size, y, x + size, y + size, r);
  ctx.arcTo(x + size, y + size, x, y + size, r);
  ctx.arcTo(x, y + size, x, y, r);
  ctx.arcTo(x, y, x + size, y, r);
  ctx.closePath();
  const grad = ctx.createLinearGradient(x, y, x + size, y + size);
  grad.addColorStop(0, '#2f7be0'); grad.addColorStop(1, '#1E63D0');
  ctx.fillStyle = grad; ctx.fill();
}

function trunc(ctx, text, maxW) {
  text = String(text || '');
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}
function wrapText(ctx, text, maxW) {
  const chars = String(text || '').split('');
  const lines = []; let line = '';
  for (const c of chars) {
    if (ctx.measureText(line + c).width > maxW && line) { lines.push(line); line = c; }
    else line += c;
  }
  if (line) lines.push(line);
  return lines;
}

function drawShareCard(ctx, W, H) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#1E63D0'; ctx.fillRect(0, 0, W, 80);
  drawLogo(ctx, 20, 20, 40);
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 19px sans-serif'; ctx.fillText('英语口语助手', 70, 42);
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = '11px sans-serif';
  ctx.fillText(currentKind === 'colloquial' ? '地道口语翻译' : '英语近义词辨析', 70, 60);

  if (currentKind === 'colloquial') {
    const d = currentData || {};
    ctx.fillStyle = '#6b7890'; ctx.font = '12px sans-serif';
    ctx.fillText('中文：' + trunc(ctx, d.zh || currentInput, W - 90), 20, 112);
    ctx.fillStyle = '#1f2937'; ctx.font = 'bold 17px sans-serif';
    let lines = wrapText(ctx, d.translation || '', W - 40);
    let y = 146;
    lines.slice(0, 4).forEach((ln) => { ctx.fillText(ln, 20, y); y += 24; });
    if (d.literal) {
      ctx.fillStyle = '#9aa7bd'; ctx.font = '11.5px sans-serif';
      y += 6;
      wrapText(ctx, '直译：' + d.literal, W - 40).slice(0, 3).forEach((ln) => { ctx.fillText(ln, 20, y); y += 17; });
    }
    const ex = (d.examples || []).slice(0, 2);
    if (ex.length) {
      y += 10;
      ctx.fillStyle = '#1E63D0'; ctx.font = 'bold 12.5px sans-serif'; ctx.fillText('地道例句', 20, y); y += 20;
      ctx.fillStyle = '#2b3a52'; ctx.font = '12px sans-serif';
      ex.forEach((e) => {
        wrapText(ctx, '· ' + e.en, W - 40).slice(0, 2).forEach((ln) => { ctx.fillText(ln, 20, y); y += 17; });
        y += 4;
      });
    }
    if (d.tip) {
      y += 4;
      ctx.fillStyle = '#B26A00'; ctx.font = 'bold 11.5px sans-serif'; ctx.fillText('提醒', 20, y); y += 16;
      ctx.fillStyle = '#7a5a10'; ctx.font = '11.5px sans-serif';
      wrapText(ctx, d.tip, W - 40).slice(0, 3).forEach((ln) => { ctx.fillText(ln, 20, y); y += 16; });
    }
  } else {
    const d = currentData || {};
    ctx.fillStyle = '#1f2937'; ctx.font = 'bold 18px sans-serif';
    ctx.fillText(trunc(ctx, resultCaption(), W - 40), 20, 120);
    const isMulti = d.mode === 'multi';
    const mainWord = isMulti ? (d.words || []).map((w) => w.word).join(' / ') : ((d.primary && d.primary.word) || '');
    ctx.fillStyle = '#1E63D0'; ctx.font = 'bold 22px sans-serif';
    ctx.fillText(trunc(ctx, mainWord, W - 40), 20, 158);
    const pos = isMulti ? '' : ((d.primary && d.primary.pos) || '');
    const phon = isMulti ? '' : ((d.primary && d.primary.phonetic) || '');
    if (pos || phon) {
      ctx.fillStyle = '#6b7890'; ctx.font = '12px sans-serif';
      ctx.fillText((pos + '  ' + phon).trim(), 20, 180);
    }
    const cn = isMulti ? '' : ((d.primary && d.primary.cn_meaning) || '');
    if (cn) {
      ctx.fillStyle = '#2b3a52'; ctx.font = '13px sans-serif';
      ctx.fillText(trunc(ctx, cn, W - 40), 20, 202);
    }
    const syns = isMulti ? (d.words || []).map((w) => w.word).join('、') : ((d.synonyms || []).map((w) => w.word).join('、'));
    if (syns) {
      ctx.fillStyle = '#1FA15A'; ctx.font = 'bold 13px sans-serif'; ctx.fillText('近义词', 20, 232);
      ctx.fillStyle = '#1f2937'; ctx.font = '13px sans-serif'; ctx.fillText(trunc(ctx, syns, W - 40), 20, 252);
    }
    const summary = (d.analysis && d.analysis.summary) || '';
    if (summary) {
      ctx.fillStyle = '#2b3a52'; ctx.font = '12px sans-serif';
      const lines = wrapText(ctx, summary, W - 40);
      let y = 290;
      lines.slice(0, 7).forEach((ln) => { ctx.fillText(ln, 20, y); y += 18; });
    }
  }
  ctx.fillStyle = '#9aa7bd'; ctx.font = '11px sans-serif';
  ctx.fillText('微信搜索「英语口语助手」体验完整辨析', 20, H - 18);
}

function openShareSheet() {
  if (!currentData) { toast('请先查询'); return; }
  const canvas = document.getElementById('shareCanvas');
  const img = document.getElementById('shareImg');
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = 320, H = 440;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawShareCard(ctx, W, H);
  try {
    img.src = canvas.toDataURL('image/png');
    img.style.display = 'block';
  } catch (e) {
    canvas.style.display = 'block';
    img.style.display = 'none';
  }
  document.getElementById('shareSheet').classList.remove('hidden');
}

function closeShareSheet() { document.getElementById('shareSheet').classList.add('hidden'); }

async function shareVia(role) {
  const url = buildShareUrl();
  const title = shareTitle();
  if (role !== 'link' && navigator.share) {
    try {
      await navigator.share({ title, text: title, url });
      closeShareSheet();
      return;
    } catch { /* 取消或不可用 → 降级复制 */ }
  }
  copyText(url);
  const msg = role === 'timeline' ? '链接已复制，请粘贴到朋友圈'
    : role === 'session' ? '链接已复制，请发送给微信好友' : '链接已复制';
  toast(msg);
  closeShareSheet();
}

function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
      return;
    }
  } catch { /* 降级 */ }
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); } catch { /* 忽略 */ }
  document.body.removeChild(ta);
}

let _toastTimer = null;
function toast(msg) {
  let el = document.getElementById('appToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'appToast';
    el.className = 'app-toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

// ══════════ 事件绑定 ══════════
goBtn.addEventListener('click', () => run());
qEl.addEventListener('input', updateCounter);
qEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); run(); }
});
document.querySelectorAll('.mode-opt').forEach((el) => {
  el.addEventListener('click', () => setMode(el.dataset.mode));
});

tabHome.addEventListener('click', () => showTab('home'));
tabRead.addEventListener('click', () => showTab('read'));
tabFav.addEventListener('click', () => showTab('fav'));

$('#appname').addEventListener('click', () => { setTip(''); queryView = 'input'; favView = 'list'; showTab('home'); });
backBtn.addEventListener('click', () => {
  setTip('');
  clearPlaying();
  if (currentTab === 'fav' && favView === 'review') { favView = 'list'; renderFavList(); paintTab(); }
  else { queryView = 'input'; paintTab(); }
});

$('#popRefresh').addEventListener('click', () => { popPage += 1; renderPhrases(); });
// 「换一批」是显式意图，永远走网络拿新内容，不吃缓存
$('#readRefresh').addEventListener('click', () => { loadReading(readPage + 1); screenTop(); });
$('#favReview').addEventListener('click', showReview);

// 分享浮层
$('#shareClose').addEventListener('click', closeShareSheet);
$('#shareMaskBg').addEventListener('click', closeShareSheet);
document.querySelectorAll('.sp-opt').forEach((el) => {
  el.addEventListener('click', () => shareVia(el.dataset.share));
});

// 帮助气泡
const helpBtn = $('#helpBtn');
const helpBubble = $('#helpBubble');
helpBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  helpBubble.classList.toggle('hidden');
});

// 全局委托
document.addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]');
  if (act) {
    const a = act.dataset.act;
    if (a === 'fav') { toggleFav(); return; }
    if (a === 'share') { openShareSheet(); return; }
    if (a === 'r-remember') { advanceReview(true); return; }
    if (a === 'r-forget') { advanceReview(false); return; }
    if (a === 'r-back') { favView = 'list'; renderFavList(); paintTab(); return; }
  }

  const say = e.target.closest('[data-say]');
  if (say) { e.stopPropagation(); speak(say.dataset.say, say); return; }

  const read = e.target.closest('[data-read]');
  if (read) {
    const i = +read.dataset.read;
    if (expandedRead.has(i)) expandedRead.delete(i); else expandedRead.add(i);
    renderReading();
    return;
  }

  const word = e.target.closest('[data-word]');
  if (word) {
    setMode('synonym', { keepValue: false });
    qEl.value = word.dataset.word;
    updateCounter();
    showTab('home');
    run();
    return;
  }

  const phrase = e.target.closest('[data-phrase]');
  if (phrase) {
    // 热门短语现在是 <a href="/phrase/...">，这里拦掉默认跳转，保持「点一下直接查」的老手感
    e.preventDefault();
    setMode('colloquial', { keepValue: false });
    qEl.value = phrase.dataset.phrase;
    updateCounter();
    showTab('home');
    run();
    return;
  }

  const rec = e.target.closest('[data-recent]');
  if (rec) {
    const arr = visibleRecent();
    const r = arr[+rec.dataset.recent];
    if (!r) return;
    currentInput = r.input;
    currentData = r.data;
    currentKind = r.kind || 'synonym';
    mode = currentKind;
    setMode(currentKind, { keepValue: false });
    qEl.value = r.input;
    updateCounter();
    renderResult(r.data, stateResult);
    queryView = 'result';
    showTab('home');
    return;
  }

  const fav = e.target.closest('[data-fav]');
  if (fav) { openFavItem(+fav.dataset.fav); return; }

  if (helpBubble.classList.contains('hidden')) return;
  if (e.target === helpBtn || helpBubble.contains(e.target)) return;
  helpBubble.classList.add('hidden');
});

// ══════════ 初始化 ══════════
favCache = loadFavs();
setMode('colloquial');
renderRecent();
renderPhrases();
renderFavList();
paintTab();

// 从内容页（/phrase/<slug>）的 CTA 进来时会带 ?q=<中文>，等价于用户已经按下 go：
// 直接填好输入框并开查，省掉一次手动粘贴。内容页是给搜索引擎看的，这条是给真人的闭环。
// 上限与口语模式一致（200 字符），超长不报错、直接截断 —— 这里只是预填，不做校验。
const bootQ = (new URLSearchParams(location.search).get('q') || '').trim();
if (bootQ) {
  qEl.value = bootQ.slice(0, 200);
  updateCounter();
  run();
}

// 打开首页就把阅读文章预取下来（命中缓存则立即返回），
// 这样用户点「阅读」tab 时通常已经就绪，不必干等一次生成。
// 必须放在所有同步初始化之后：它是异步的，不会阻塞首屏。
prefetchReading();
