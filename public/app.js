// app.js — Miss Pompei 前端交互（查近义词 / 近义词库 / 发音）
const $ = (s) => document.querySelector(s);
const stateInput = $('#state-input');
const stateLoading = $('#state-loading');
const stateResult = $('#state-result');
const stateLibrary = $('#state-library');
const stateDetail = $('#state-detail');
const q = $('#q');
const go = $('#go');
const tip = $('#tip');
const recentList = $('#recent');
const backBtn = $('#backBtn');
const tabQuery = $('#tabQuery');
const tabLib = $('#tabLib');
const libRecent = $('#lib-recent');
const libPopular = $('#lib-popular');
const libRefresh = $('#libRefresh');
const RECENT_KEY = 'ms_recent';

const CN_RE = /[㐀-䶿一-鿿]/g;
const ACCENTS = ['var(--blue)', 'var(--green)', 'var(--orange)'];
const SPEAKER = '<svg class="sp-ico" viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>';

// 状态机：两个 tab 各自记住内部子视图，切换 tab 互不丢失状态
let currentTab = 'query';   // 'query' | 'library'
let queryView = 'input';    // 'input' | 'loading' | 'result'
let libView = 'library';    // 'library' | 'detail'
let popPage = 0;

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
  backBtn.classList.toggle('hidden', libView !== 'detail');
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
      <div class="result-summary">${esc(p.word)}单词有${synCount}个近义词</div>
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
      <div class="result-summary">本次一共对比${wCount}个单词</div>
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
  renderLibRecent();
  renderLibPopular();
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
function renderLibPopular() {
  const all = (window.POPULAR_DATA || []);
  const batches = Math.ceil(all.length / 10) || 1;
  if (popPage >= batches) popPage = 0;
  const batch = all.slice(popPage * 10, popPage * 10 + 10);
  if (!batch.length) {
    // 数据可能尚未就绪，稍后重试一次（避免脚本加载时序导致空白）
    if (all.length === 0 && !renderLibPopular._retry) {
      renderLibPopular._retry = true;
      setTimeout(() => { renderLibPopular._retry = false; renderLibrary(); }, 400);
    }
    libPopular.innerHTML = '<div class="lib-empty">暂无热门数据</div>';
    return;
  }
  libPopular.innerHTML = batch.map((d, i) => `
    <div class="lib-item" data-i="${i}">
      <div class="lib-title">${esc(titleOf(d))}</div>
      <div class="lib-sub">${esc(subOf(d))}</div>
    </div>`).join('');
  libPopular.querySelectorAll('.lib-item').forEach((el) => {
    el.addEventListener('click', () => showDetail(batch[+el.dataset.i]));
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
  if (libView === 'detail') { libView = 'library'; paintLibrary(); }
  else { queryView = 'input'; paintQuery(); }
});
tabQuery.addEventListener('click', () => showTab('query'));
tabLib.addEventListener('click', () => showTab('library'));
libRefresh.addEventListener('click', () => { popPage++; renderLibPopular(); });

// 帮助气泡（右上角 ? 点击，不切换页面）
const helpBtn = $('#helpBtn');
const helpBubble = $('#helpBubble');
helpBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  helpBubble.classList.toggle('hidden');
});
// 文档点击：发音按钮 + 关闭帮助气泡
document.addEventListener('click', (e) => {
  const sp = e.target.closest('.wc-speak');
  if (sp) { e.stopPropagation(); speak(sp.dataset.word); return; }
  if (helpBubble.classList.contains('hidden')) return;
  if (e.target === helpBtn || helpBubble.contains(e.target)) return;
  helpBubble.classList.add('hidden');
});
document.querySelectorAll('.tag').forEach((t) => {
  t.addEventListener('click', () => { q.value = t.textContent.trim(); setTip(''); run(); });
});

// ---------- 初始化 ----------
renderRecent();
renderLibrary();          // 预渲染库：确保打开即有默认热门 10 条
window.addEventListener('load', renderLibrary);  // 脚本全部就绪后再补一次，避免加载时序导致空白
showTab('query');
