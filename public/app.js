// app.js — Miss Pompei 前端交互（查近义词 / 近义词库 / 发音）
const $ = (s) => document.querySelector(s);
const stateInput = $('#state-input');
const stateLoading = $('#state-loading');
const stateResult = $('#state-result');
const stateLibrary = $('#state-library');
const stateDetail = $('#state-detail');
const stateReview = $('#state-review');
const q = $('#q');
const go = $('#go');
const tip = $('#tip');
const recentList = $('#recent');
const backBtn = $('#backBtn');
const tabQuery = $('#tabQuery');
const tabLib = $('#tabLib');
const libRecent = $('#lib-recent');
const libRefresh = $('#libRefresh');
const RECENT_KEY = 'ms_recent';

const CN_RE = /[㐀-䶿一-鿿]/g;
const ACCENTS = ['var(--blue)', 'var(--green)', 'var(--orange)'];
const SPEAKER = '<svg class="sp-ico" viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>';

// 状态机：两个 tab 各自记住内部子视图，切换 tab 互不丢失状态
let currentTab = 'query';   // 'query' | 'library'
let queryView = 'input';    // 'input' | 'loading' | 'result'
let libView = 'library';    // 'library' | 'detail' | 'review'
let popPage = 0;

// 当前结果（用于收藏 / 复习）
let currentInput = '';
let currentData = null;

// 收藏 / 复习数据
const FAV_KEY = 'ms_favorites';
const REVIEW_DAYS = [1, 2, 4, 7, 15];
let favCache = [];
let reviewList = [];
let reviewIdx = 0;

// 仅重绘「查近义词」tab 内部的子视图（结果页 innerHTML 保留，切换回来仍在）
function paintQuery() {
  stateLibrary.classList.add('hidden');
  stateDetail.classList.add('hidden');
  stateInput.classList.toggle('hidden', queryView !== 'input');
  stateLoading.classList.toggle('hidden', queryView !== 'loading');
  stateResult.classList.toggle('hidden', queryView !== 'result');
  backBtn.classList.toggle('hidden', queryView !== 'result');
}

// 仅重绘「近义词库」tab 内部的子视图
function paintLibrary() {
  stateInput.classList.add('hidden');
  stateLoading.classList.add('hidden');
  stateResult.classList.add('hidden');
  stateLibrary.classList.toggle('hidden', libView !== 'library');
  stateDetail.classList.toggle('hidden', libView !== 'detail');
  stateReview.classList.toggle('hidden', libView !== 'review');
  backBtn.classList.toggle('hidden', !(libView === 'detail' || libView === 'review'));
  if (libView === 'library') renderLibrary();
}

// 主切换：查近义词 / 近义词库（各自保留上次的子状态）
function showTab(tab) {
  currentTab = tab;
  tabQuery.classList.toggle('active', tab === 'query');
  tabLib.classList.toggle('active', tab === 'library');
  if (tab === 'query') paintQuery();
  else paintLibrary();
}

// 从库中点开某条，复用结果渲染，显示完整辨析
function showDetail(data) {
  libView = 'detail';
  currentInput = (data && data.primary && data.primary.word) || currentInput;
  currentData = data;
  renderResult(data, stateDetail);
  paintLibrary();
}

function setTip(msg) {
  tip.textContent = msg ? '⚠ ' + msg : '';
  tip.style.display = msg ? 'block' : 'none';
}

function validate(raw) {
  const s = (raw || '').trim();
  if (!s) return '请输入要查询的单词';
  if ([...s].length > 100) return '暂不支持超过100个字符的长度';
  const cn = (s.match(CN_RE) || []).length;
  if (cn >= 1) return '不支持中文输入';
  return '';
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
  }[c]));
}

// ---------- 查询流程 ----------
async function run() {
  const v = validate(q.value);
  if (v) { setTip(v); return; }
  setTip('');
  const input = q.value.trim();
  queryView = 'loading';
  paintQuery();
  try {
    const resp = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || '请求失败');
    currentInput = input;
    currentData = data;
    renderResult(data);
    pushRecent(input, data);
    queryView = 'result';
  } catch (e) {
    queryView = 'input';
    setTip(e.message || '服务暂时不可用');
  }
  paintQuery();
}

// ---------- 渲染：单词卡片（含发音按钮） ----------
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
        <button class="wc-speak" data-word="${esc(w.word)}" title="英式发音" aria-label="英式发音">${SPEAKER}</button>
        <span class="wc-pos">${esc(w.pos)}</span>
      </div>
      <div class="wc-cn">${esc(w.cn_meaning)}</div>
      <div class="wc-usage">${esc(w.usage)}</div>
      <div class="wc-examples">${ex}</div>
    </div>`;
}

// ---------- 渲染：场景1（单词 + 同义词） ----------
function renderSingle(data, target) {
  target = target || stateResult;
  const p = data.primary || {};
  const syn = (data.synonyms || [])
    .map((w) => wordCard(w, 'var(--green)')).join('');
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

// ---------- 渲染：场景2（多词对比） ----------
function renderMulti(data, target) {
  target = target || stateResult;
  const words = (data.words || [])
    .map((w, i) => wordCard(w, ACCENTS[i % ACCENTS.length])).join('');
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
      <div class="result-summary"><span class="rs-text">本次一共对比${wCount}个单词</span><span class="rs-btns"><button class="share-img-btn" data-act="share">分享</button></span></div>
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

function renderResult(data, target) {
  if (data.mode === 'multi') renderMulti(data, target);
  else renderSingle(data, target);
}

// ---------- 收藏 / 复习 ----------
function loadFavs() {
  try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); }
  catch { return []; }
}
function saveFavs(arr) {
  favCache = arr;
  try { localStorage.setItem(FAV_KEY, JSON.stringify(arr.slice(0, 200))); } catch { /* ignore */ }
  renderFavSection();
  updateFavBtn();
}
function isFav(input) { return favCache.some((r) => r.input === input); }
function favBtnHtml() {
  const on = isFav(currentInput);
  return `<button class="fav-btn ${on ? 'on' : ''}" data-act="fav">${on ? '★ 已收藏' : '☆ 收藏'}</button>`;
}
function toggleFav() {
  if (!currentInput) return;
  if (isFav(currentInput)) removeFav(currentInput);
  else addFav(currentInput, currentData);
}
function addFav(input, data) {
  const rec = {
    input, data,
    level: 0,
    nextReview: Date.now() + REVIEW_DAYS[0] * 864e5,
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  favCache = favCache.filter((r) => r.input !== input);
  favCache.unshift(rec);
  saveFavs(favCache);
}
function removeFav(input) {
  favCache = favCache.filter((r) => r.input !== input);
  saveFavs(favCache);
}
function updateFavBtn() {
  const btn = document.querySelector('#state-result .fav-btn');
  if (!btn) return;
  const on = isFav(currentInput);
  btn.className = 'fav-btn' + (on ? ' on' : '');
  btn.textContent = on ? '★ 已收藏' : '☆ 收藏';
}
function renderFavSection() {
  const now = Date.now();
  const favEl = document.getElementById('lib-fav');
  if (!favEl) return;
  if (!favCache.length) {
    favEl.innerHTML = '<div class="lib-empty">收藏后这里会出现生词本，点结果页「☆ 收藏」加入复习计划</div>';
  } else {
    favEl.innerHTML = favCache.map((r, i) => `
      <div class="lib-item" data-fav="${i}">
        <div class="lib-title">${esc(titleOf(r.data))}</div>
        <div class="lib-sub">${esc(subOf(r.data))}</div>
      </div>`).join('');
  }
  const ready = favCache.filter((r) => (r.nextReview || 0) <= now).length;
  const badge = document.getElementById('reviewBadge');
  if (badge) badge.textContent = ready > 0 ? '(' + ready + ')' : '';
}
function renderScene() {
  const wrap = document.getElementById('lib-scene');
  if (!wrap) return;
  wrap.innerHTML = SCENE.map((s) => {
    const items = s.words.map((w) => `
      <div class="lib-item lib-item--word" data-word="${esc(w)}">
        <div class="lib-title">${esc(w)}</div>
      </div>`).join('');
    return `<div class="scene-block"><div class="scene-name">${esc(s.name)}</div><div class="lib-list">${items}</div></div>`;
  }).join('');
}
function openShareSheet() {
  const d = currentData;
  if (!d) { alert('请先查询'); return; }
  const canvas = document.getElementById('shareCanvas');
  const img = document.getElementById('shareImg');
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = 320, H = 440;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  // 顶部蓝色块 + logo + 品牌
  ctx.fillStyle = '#1E63D0'; ctx.fillRect(0, 0, W, 80);
  drawLogo(ctx, 20, 20, 40);
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 19px sans-serif'; ctx.fillText('单词助手', 70, 42);
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = '11px sans-serif'; ctx.fillText('英语近义词辨析', 70, 60);
  // 分享标题
  const title = shareTitle();
  ctx.fillStyle = '#1f2937'; ctx.font = 'bold 18px sans-serif'; ctx.fillText(trunc(ctx, title, W - 40), 20, 120);
  // 主词 / 对比词
  const isMulti = d.mode === 'multi';
  const mainWord = isMulti ? (d.words || []).map((w) => w.word).join(' / ') : ((d.primary && d.primary.word) || '');
  ctx.fillStyle = '#1E63D0'; ctx.font = 'bold 22px sans-serif'; ctx.fillText(trunc(ctx, mainWord, W - 40), 20, 158);
  const pos = isMulti ? '' : ((d.primary && d.primary.pos) || '');
  const phon = isMulti ? '' : ((d.primary && d.primary.phonetic) || '');
  if (pos || phon) { ctx.fillStyle = '#6b7890'; ctx.font = '12px sans-serif'; ctx.fillText((pos + '  ' + phon).trim(), 20, 180); }
  const cn = isMulti ? '' : ((d.primary && d.primary.cn_meaning) || '');
  if (cn) { ctx.fillStyle = '#2b3a52'; ctx.font = '13px sans-serif'; ctx.fillText(trunc(ctx, cn, W - 40), 20, 202); }
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
  ctx.fillStyle = '#9aa7bd'; ctx.font = '11px sans-serif';
  ctx.fillText('微信搜索「单词助手」体验完整辨析', 20, H - 18);
  try {
    img.src = canvas.toDataURL('image/png');
    img.style.display = 'block';
  } catch (e) {
    canvas.style.display = 'block';
    img.style.display = 'none';
  }
  document.getElementById('shareSheet').classList.remove('hidden');
}

// 圆角 logo 标志（蓝色方块 + 白色「词」）
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
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold ' + Math.floor(size * 0.5) + 'px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('词', x + size / 2, y + size / 2 + 1);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}

// 分享标题：单词助手-xxx和xxx的区别
function shareTitle() {
  const d = currentData;
  if (!d) return '单词助手-近义词辨析';
  let words = [];
  if (d.mode === 'multi') words = (d.words || []).map((w) => w.word);
  else { const p = (d.primary && d.primary.word) || ''; const syns = (d.synonyms || []).map((w) => w.word); words = [p].concat(syns).filter(Boolean); }
  const join = (arr) => (arr.length <= 2 ? arr.join('和') : arr.join('、'));
  const core = words.length ? join(words.slice(0, 4)) : (currentInput || '');
  return '单词助手-' + core + '的区别';
}

function buildShareUrl() {
  const q = (currentInput || '').trim();
  return 'https://misspompei.onrender.com/' + (q ? ('?q=' + encodeURIComponent(q)) : '');
}

// 分享动作：朋友圈 / 微信好友 优先调系统分享面板（移动端可直达微信），否则复制链接 + 提示
async function shareVia(role) {
  const url = buildShareUrl();
  const title = shareTitle();
  if (role !== 'link' && navigator.share) {
    try {
      await navigator.share({ title, text: title, url });
      closeShareSheet();
      return;
    } catch (e) { /* 用户取消或不可用，降级复制链接 */ }
  }
  copyText(url);
  const tip = role === 'timeline' ? '链接已复制，请粘贴到朋友圈' : role === 'session' ? '链接已复制，请发送给微信好友' : '链接已复制';
  toast(tip);
  closeShareSheet();
}

function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
      return;
    }
  } catch (e) {}
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); } catch (e) {}
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

function closeShareSheet() { document.getElementById('shareSheet').classList.add('hidden'); }
function trunc(ctx, text, maxW) {
  text = String(text || '');
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}
function wrapText(ctx, text, maxW) {
  text = String(text || '');
  const chars = text.split('');
  const lines = []; let line = '';
  for (const c of chars) {
    if (ctx.measureText(line + c).width > maxW && line) { lines.push(line); line = c; }
    else line += c;
  }
  if (line) lines.push(line);
  return lines;
}

function showReview() {
  const now = Date.now();
  const due = favCache.filter((r) => (r.nextReview || 0) <= now).slice(0, 30);
  if (!due.length) { alert('暂无待复习'); return; }
  reviewList = due; reviewIdx = 0;
  libView = 'review';
  renderReviewCard();
  paintLibrary();
}
function renderReviewCard() {
  const rec = reviewList[reviewIdx];
  if (!rec) { finishReview(); return; }
  currentInput = rec.input;
  currentData = rec.data;
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
}
function advanceReview(remembered) {
  const rec = reviewList[reviewIdx];
  if (!rec) return;
  let level = rec.level || 0;
  if (remembered) level = Math.min(level + 1, REVIEW_DAYS.length - 1);
  else level = 0;
  rec.level = level;
  rec.nextReview = Date.now() + REVIEW_DAYS[level] * 864e5;
  rec.updatedAt = Date.now();
  const idx = favCache.findIndex((r) => r.input === rec.input);
  if (idx >= 0) favCache[idx] = rec;
  try { localStorage.setItem(FAV_KEY, JSON.stringify(favCache.slice(0, 200))); } catch { /* ignore */ }
  reviewIdx += 1;
  if (reviewIdx >= reviewList.length) finishReview();
  else renderReviewCard();
}
function finishReview() {
  const total = reviewList.length;
  stateReview.innerHTML = `<div class="review-done">
      <div class="rd-emoji">🎉</div>
      <div class="rd-title">本轮复习完成</div>
      <div class="rd-sub">共复习 ${total} 个单词</div>
      <button class="rev-btn remember wide" data-act="r-back">返回生词本</button>
    </div>`;
  reviewList = []; reviewIdx = 0;
  renderFavSection();
}

// ---------- 最近查询（待输入页） ----------
function getRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); }
  catch { return []; }
}
function pushRecent(input, data) {
  const arr = getRecent().filter((x) => x.input !== input);
  arr.unshift({ input, data });
  localStorage.setItem(RECENT_KEY, JSON.stringify(arr.slice(0, 10)));
  renderRecent();
}
function renderRecent() {
  const arr = getRecent();
  recentList.innerHTML = arr.length
    ? arr.map((x) => `<li class="recent-item">${esc(x.input)}</li>`).join('')
    : '<li class="recent-empty">暂无记录</li>';
  recentList.querySelectorAll('.recent-item').forEach((li, i) => {
    li.addEventListener('click', () => { q.value = arr[i].input; setTip(''); run(); });
  });
}

// ---------- 近义词库 ----------
function titleOf(d) {
  if (d.mode === 'multi') {
    return (d.words || []).map((w) => w.word).join(' / ');
  }
  const p = d.primary || {};
  const syns = (d.synonyms || []).map((w) => w.word).join(', ');
  return p.word + (syns ? ' → ' + syns : '');
}
function subOf(d) {
  if (d.mode === 'multi') {
    return '对比 ' + (d.words || []).length + ' 个单词';
  }
  return (d.primary?.cn_meaning || '') + ' · 有 ' + (d.synonyms || []).length + ' 个近义词';
}
function renderLibrary() {
  if (libTab === 'scene') renderScene();
  else if (libTab === 'fav') renderFavSection();
  else renderLibRecent();
  showLibPanel();
}
function showLibPanel() {
  const map = { recent: 'panel-recent', fav: 'panel-fav', scene: 'panel-scene' };
  ['recent', 'fav', 'scene'].forEach((t) => {
    const p = document.getElementById(map[t]);
    if (p) p.classList.toggle('hidden', t !== libTab);
    const tb = document.getElementById('tab' + t.charAt(0).toUpperCase() + t.slice(1));
    if (tb) tb.classList.toggle('active', t === libTab);
  });
}
function renderLibRecent() {
  const arr = getRecent();
  if (!arr.length) {
    libRecent.innerHTML = '<div class="lib-empty">还没有查询记录，去「查近义词」试试吧</div>';
    return;
  }
  libRecent.innerHTML = arr.map((r, i) => `
    <div class="lib-item" data-i="${i}">
      <div class="lib-title">${esc(titleOf(r.data))}</div>
      <div class="lib-sub">${esc(subOf(r.data))}</div>
    </div>`).join('');
  libRecent.querySelectorAll('.lib-item').forEach((el) => {
    el.addEventListener('click', () => showDetail(arr[+el.dataset.i].data));
  });
}
function renderPopInput() {
  const el = document.getElementById('pop-input');
  if (!el) return;
  const all = (window.POPULAR_DATA || []);
  if (!all.length) {
    if (!renderPopInput._retry) {
      renderPopInput._retry = true;
      setTimeout(() => { renderPopInput._retry = false; renderPopInput(); }, 400);
    }
    el.innerHTML = '<div class="lib-empty">暂无热门数据</div>';
    return;
  }
  const size = Math.min(10, all.length);
  const start = (popPage * size) % all.length;
  const page = [];
  for (let i = 0; i < size; i++) page.push(all[(start + i) % all.length]);
  el.innerHTML = page.map((d) => {
    const input = d.__input || (d.mode === 'multi' ? (d.words || []).map((w) => w.word).join(' ') : ((d.primary && d.primary.word) || ''));
    return `<span class="pop-item" data-pop="${esc(input)}">${esc(titleOf(d))}</span>`;
  }).filter(Boolean).join('');
  el.querySelectorAll('.pop-item').forEach((sp) => {
    sp.addEventListener('click', () => { q.value = sp.dataset.pop; setTip(''); run(); });
  });
}

// ---------- 发音（英式 en-GB） ----------
function speak(word) {
  if (!('speechSynthesis' in window)) {
    alert('当前浏览器不支持语音发音');
    return;
  }
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(word);
    u.lang = 'en-GB';
    u.rate = 0.9;
    const v = (speechSynthesis.getVoices() || [])
      .find((vv) => /en[-_]GB/i.test(vv.lang) || /British|UK/i.test(vv.name));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  } catch (e) { /* 忽略 */ }
}
if ('speechSynthesis' in window) {
  speechSynthesis.getVoices();
  speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
}

// ---------- 事件绑定 ----------
go.addEventListener('click', run);
q.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
$('#appname').addEventListener('click', () => { setTip(''); queryView = 'input'; showTab('query'); });
backBtn.addEventListener('click', () => {
  setTip('');
  if (libView === 'review' || libView === 'detail') { libView = 'library'; paintLibrary(); }
  else { queryView = 'input'; paintQuery(); }
});
tabQuery.addEventListener('click', () => showTab('query'));
tabLib.addEventListener('click', () => showTab('library'));
if (libRefresh) libRefresh.addEventListener('click', () => { popPage++; renderPopInput(); });
['recent', 'fav', 'scene'].forEach((t) => {
  const el = document.getElementById('tab' + t.charAt(0).toUpperCase() + t.slice(1));
  if (el) el.addEventListener('click', () => { libTab = t; renderLibrary(); });
});
const libReview = document.getElementById('lib-review');
if (libReview) libReview.addEventListener('click', showReview);
// 分享浮层：关闭 + 三个分享选项
const shareClose = document.getElementById('shareClose');
if (shareClose) shareClose.addEventListener('click', closeShareSheet);
const shareMaskBg = document.getElementById('shareMaskBg');
if (shareMaskBg) shareMaskBg.addEventListener('click', closeShareSheet);
document.querySelectorAll('.sp-opt').forEach((el) => {
  el.addEventListener('click', () => shareVia(el.dataset.share));
});

// 帮助气泡（右上角 ? 点击，不切换页面）
const helpBtn = $('#helpBtn');
const helpBubble = $('#helpBubble');
helpBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  helpBubble.classList.toggle('hidden');
});
// 文档点击：发音按钮 + 关闭帮助气泡
document.addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]');
  if (act) {
    const a = act.dataset.act;
    if (a === 'fav') { toggleFav(); return; }
    if (a === 'review') { showReview(); return; }
    if (a === 'r-remember') { advanceReview(true); return; }
    if (a === 'r-forget') { advanceReview(false); return; }
    if (a === 'r-back') { libView = 'library'; paintLibrary(); return; }
    if (a === 'share') { openShareSheet(); return; }
  }
  const fav = e.target.closest('[data-fav]');
  if (fav) { const r = favCache[+fav.dataset.fav]; if (r) showDetail(r.data); return; }
  const sp = e.target.closest('.wc-speak');
  if (sp) { e.stopPropagation(); speak(sp.dataset.word); return; }
  const scene = e.target.closest('[data-word]');
  if (scene) { q.value = scene.dataset.word; setTip(''); run(); return; }
  const pop = e.target.closest('[data-pop]');
  if (pop) { q.value = pop.dataset.pop; setTip(''); run(); return; }
  if (helpBubble.classList.contains('hidden')) return;
  if (e.target === helpBtn || helpBubble.contains(e.target)) return;
  helpBubble.classList.add('hidden');
});
document.querySelectorAll('.tag').forEach((t) => {
  t.addEventListener('click', () => { q.value = t.textContent.trim(); setTip(''); run(); });
});

// ---------- 初始化 ----------
renderRecent();
favCache = loadFavs();
renderPopInput();
renderLibrary();          // 预渲染库：确保打开即有默认内容
window.addEventListener('load', renderLibrary);  // 脚本全部就绪后再补一次，避免加载时序导致空白
showTab('query');
