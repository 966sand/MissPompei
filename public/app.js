// app.js — Miss Sorrento 前端交互（待输入 / 加载 / 结果 三态）
const $ = (s) => document.querySelector(s);
const stateInput = $('#state-input');
const stateLoading = $('#state-loading');
const stateResult = $('#state-result');
const q = $('#q');
const go = $('#go');
const tip = $('#tip');
const recentList = $('#recent');
const RECENT_KEY = 'ms_recent';

const CN_RE = /[㐀-䶿一-鿿]/g;
const ACCENTS = ['var(--blue)', 'var(--green)', 'var(--orange)'];

function showState(name) {
  stateInput.classList.toggle('hidden', name !== 'input');
  stateLoading.classList.toggle('hidden', name !== 'loading');
  stateResult.classList.toggle('hidden', name !== 'result');
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
  if (cn >= 6) return '不支持纯中文输入';
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
  showState('loading');
  try {
    const resp = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || '请求失败');
    renderResult(data);
    pushRecent(input);
    showState('result');
  } catch (e) {
    showState('input');
    setTip(e.message || '服务暂时不可用');
  }
}

// ---------- 渲染：单词卡片 ----------
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
        <span class="wc-pos">${esc(w.pos)}</span>
      </div>
      <div class="wc-cn">${esc(w.cn_meaning)}</div>
      <div class="wc-usage">${esc(w.usage)}</div>
      <div class="wc-examples">${ex}</div>
    </div>`;
}

// ---------- 渲染：场景1（单词 + 同义词） ----------
function renderSingle(data) {
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

  stateResult.innerHTML = `
    <div class="result-scroll">
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
function renderMulti(data) {
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

  stateResult.innerHTML = `
    <div class="result-scroll">
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

function renderResult(data) {
  if (data.mode === 'multi') renderMulti(data);
  else renderSingle(data);
}

// ---------- 最近查询 ----------
function getRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); }
  catch { return []; }
}
function pushRecent(v) {
  const arr = getRecent().filter((x) => x !== v);
  arr.unshift(v);
  localStorage.setItem(RECENT_KEY, JSON.stringify(arr.slice(0, 6)));
  renderRecent();
}
function renderRecent() {
  const arr = getRecent();
  recentList.innerHTML = arr.length
    ? arr.map((x) => `<li class="recent-item">${esc(x)}</li>`).join('')
    : '<li class="recent-empty">暂无记录</li>';
  recentList.querySelectorAll('.recent-item').forEach((li, i) => {
    li.addEventListener('click', () => { q.value = arr[i]; setTip(''); run(); });
  });
}

// ---------- 事件绑定 ----------
go.addEventListener('click', run);
q.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
$('#appname').addEventListener('click', () => { setTip(''); showState('input'); });
document.querySelectorAll('.tag').forEach((t) => {
  t.addEventListener('click', () => { q.value = t.textContent.trim(); setTip(''); run(); });
});

// ---------- 初始化 ----------
renderRecent();
showState('input');
