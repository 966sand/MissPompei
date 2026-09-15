// validate.js — 输入校验（前端 + 后端共用同一套规则）
// 规则：
//   1. 长度 1–100 个字符；超过 100 返回「暂不支持超过100个字符的长度」
//   2. 只要检测到任意中文字符即返回「不支持中文输入」
//   3. 空输入返回「请输入要查询的单词」

const CN_RE = /[㐀-䶿一-鿿]/g;

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

// 口语翻译输入校验：必须是中文，1–50 字
// 规则：
//   1. 空输入 → 「请输入要翻译的中文」
//   2. 超过 50 字 → 「最多支持 50 个字」
//   3. 一个中文字符都没有（如纯英文） → 「请输入中文，口语翻译只支持中文」
export function validateColloquialInput(raw) {
  const s = (raw || '').trim();
  if (s.length === 0) return { ok: false, msg: '请输入要翻译的中文' };

  const len = [...s].length;
  if (len > 50) return { ok: false, msg: `最多支持 50 个字，当前 ${len} 个字` };

  const cnCount = (s.match(CN_RE) || []).length;
  if (cnCount === 0) return { ok: false, msg: '请输入中文，口语翻译只支持中文' };

  // 中日韩混排时，中文必须占主体，避免整段日文/韩文被当成中文送进去
  const cjk = (s.match(/[\u3040-\u30ff\uac00-\ud7af]/g) || []).length;
  if (cjk > 0 && cjk >= cnCount) return { ok: false, msg: '请输入中文，口语翻译只支持中文' };

  return { ok: true, normalized: s };
}
