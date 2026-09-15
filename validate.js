// validate.js — 输入校验（前端 + 后端共用同一套规则）
// 规则：
//   1. 长度 1–100 个字符；超过 100 返回「暂不支持超过100个字符的长度」
//   2. 只要检测到任意中文字符即返回「不支持中文输入」
//   3. 空输入返回「请输入要查询的单词」

const CN_RE = /[㐀-䶿一-鿿]/g;
// 是否含英文字母（用于区分「整句英文」与其他非中文输入）
const EN_RE = /[A-Za-z]/;
// 日文假名 / 韩文谚文（含这些且不占少数时视为非中文）
const KANA_HANGUL_RE = /[\u3040-\u30ff\uac00-\ud7af]/g;

export function validateInput(raw) {
  const s = (raw || '').trim();
  if (s.length === 0) return { ok: false, msg: '请输入要查询的单词' };

  // 用码点计数，避免代理对导致长度失真
  const len = [...s].length;
  if (len > 100) return { ok: false, msg: '暂不支持超过100个字符的长度' };

  const cnCount = (s.match(CN_RE) || []).length;
  if (cnCount >= 1) return { ok: false, msg: '不支持中文输入' };

  return { ok: true, normalized: s };
}

// 把输入拆成词 token（多词场景用空格分隔）
export function toTokens(input) {
  return input
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

// 口语翻译输入校验：只支持「纯中文」与「中英混合」，1–50 字
// 规则（按「越致命越先报」排序）：
//   1. 空输入 → 「请输入要翻译的中文」
//   2. 一个中文字符都没有（语言性错误，优先于长度报错）：
//        - 含英文字母（如整句英文）→ 「抱歉，目前暂时不支持英翻中」
//        - 其他（如纯日文假名）→ 「请输入中文，口语翻译只支持中文」
//   3. 超过 50 字 → 「最多支持 50 个字」
//   4. 中日韩混排时中文不占主体 → 「请输入中文，口语翻译只支持中文」
export function validateColloquialInput(raw) {
  const s = (raw || '').trim();
  if (s.length === 0) return { ok: false, msg: '请输入要翻译的中文' };

  // 必须含中文：纯中文、中英混合都放行；完全不含中文直接拒绝
  const cnCount = (s.match(CN_RE) || []).length;
  if (cnCount === 0) {
    const msg = EN_RE.test(s) ? '抱歉，目前暂时不支持英翻中' : '请输入中文，口语翻译只支持中文';
    return { ok: false, msg };
  }

  const len = [...s].length;
  if (len > 50) return { ok: false, msg: `最多支持 50 个字，当前 ${len} 个字` };

  // 中日韩混排时，中文必须占主体，避免整段日文/韩文被当成中文送进去
  const cjk = (s.match(KANA_HANGUL_RE) || []).length;
  if (cjk > 0 && cjk >= cnCount) return { ok: false, msg: '请输入中文，口语翻译只支持中文' };

  return { ok: true, normalized: s };
}
