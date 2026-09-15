// deepseek.js — 调用 DeepSeek（OpenAI 兼容接口），解析并兜底为 JSON
import { DEEPSEEK_API_KEY, DEEPSEEK_API_URL, DEEPSEEK_MODEL } from './config.js';

// 针对被 max_tokens 截断的残缺 JSON，尝试关闭未闭合字符串并补齐括号
function repairJSON(s) {
  try {
    JSON.parse(s);
    return s;
  } catch {}

  let inString = false;
  let escaped = false;
  const stack = [];
  for (const c of s) {
    if (escaped) { escaped = false; continue; }
    if (c === '\\') { escaped = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === '{' || c === '[') stack.push(c);
    else if ((c === '}' || c === ']') && stack.length) stack.pop();
  }

  let repaired = s;
  if (inString) repaired += '"';

  const closes = [];
  while (stack.length) {
    const c = stack.pop();
    closes.push(c === '{' ? '}' : ']');
  }
  repaired += closes.join('');

  try {
    JSON.parse(repaired);
    return repaired;
  } catch {}
  return s; // 无法修复，返回原串让上层继续试其它候选
}

function stripFences(s) {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (m) return m[1].trim();
  return s;
}

function parseModelJSON(content) {
  const raw = (content || '').trim();
  if (!raw) throw new Error('模型返回内容为空');

  // 去掉 ```json ... ``` 包裹，并处理偶尔出现的 "json\n{" 前缀
  const noPrefix = raw.replace(/^\s*json\s*/i, '');

  const candidates = new Set();
  candidates.add(noPrefix);

  const fenced = stripFences(noPrefix);
  if (fenced !== noPrefix) candidates.add(fenced);

  // 只保留第一个 { 到最后一个 }，剥离前后夹带文字
  const first = noPrefix.indexOf('{');
  const last = noPrefix.lastIndexOf('}');
  if (first !== -1 && last > first) {
    candidates.add(noPrefix.slice(first, last + 1));
  }

  for (const cand of candidates) {
    const s = repairJSON(cand);
    try {
      const obj = JSON.parse(s);
      if (obj && typeof obj === 'object') return obj;
    } catch (e) {
      // 试下一个候选
    }
  }

  // 全部失败：把原始内容前 200 字符带出，便于定位
  const snippet = raw.slice(0, 200);
  throw new Error('模型返回的不是有效 JSON。原始内容前200字符：' + snippet);
}

// 单次请求（30s 超时）；system 可选，maxTokens 可按场景放大
async function callDeepSeekOnce(userPrompt, { system = '', maxTokens = 4000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  try {
    const messages = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: userPrompt });

    const resp = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        thinking: { type: 'disabled' },
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      const err = new Error(`DeepSeek API ${resp.status}: ${text.slice(0, 200)}`);
      err.status = resp.status;
      throw err;
    }

    const j = await resp.json();
    const content = j?.choices?.[0]?.message?.content || '';
    return parseModelJSON(content);
  } finally {
    clearTimeout(timer);
  }
}

// 可重试的状态码（临时性故障）
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

// 带退避的自动重试封装：吞掉大多数瞬时 503/超时/偶发 JSON 解析失败
export async function callDeepSeek(userPrompt, { retries = 2, baseDelay = 1000, system = '', maxTokens = 4000 } = {}) {
  if (!DEEPSEEK_API_KEY) {
    throw new Error('服务端未配置 DEEPSEEK_API_KEY');
  }

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await callDeepSeekOnce(userPrompt, { system, maxTokens });
    } catch (e) {
      lastErr = e;
      const status = e.status;
      const isRetryable =
        (status && RETRYABLE.has(status)) ||
        e.name === 'AbortError' ||
        e.name === 'TypeError' || // 网络层错误（连接中断等）
        /模型返回的不是有效 JSON|返回内容为空/.test(e.message);
      if (!isRetryable) throw e; // 400/401 等不可重试错误直接抛出
      if (attempt === retries) break; // 用尽重试次数
      const delay = baseDelay * Math.pow(2, attempt); // 1s, 2s, 4s ...
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  // 重试用尽：给出更友好的文案
  if (lastErr && /too busy|service_unavailable|503/i.test(lastErr.message)) {
    throw new Error('DeepSeek 服务暂时繁忙，请稍后重试（或稍等片刻再试一次）');
  }
  throw lastErr;
}
