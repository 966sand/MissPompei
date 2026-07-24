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
