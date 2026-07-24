// deepseek.js — 调用 DeepSeek（OpenAI 兼容接口），解析并兜底为 JSON
import { DEEPSEEK_API_KEY, DEEPSEEK_API_URL, DEEPSEEK_MODEL } from './config.js';

function parseModelJSON(content) {
  let s = (content || '').trim();
  // 兼容模型偶尔用 ```json ... ``` 包裹的情况
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) s = fenced[1].trim();
  try {
    return JSON.parse(s);
  } catch {
    throw new Error('模型返回的不是有效 JSON');
  }
}

// 单次请求（30s 超时）
async function callDeepSeekOnce(userPrompt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  try {
    const resp = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [{ role: 'user', content: userPrompt }],
        temperature: 0.3,
        response_format: { type: 'json_object' },
        max_tokens: 2000,
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

// 带退避的自动重试封装：吞掉大多数瞬时 503/超时
export async function callDeepSeek(userPrompt, { retries = 2, baseDelay = 1000 } = {}) {
  if (!DEEPSEEK_API_KEY) {
    throw new Error('服务端未配置 DEEPSEEK_API_KEY');
  }

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await callDeepSeekOnce(userPrompt);
    } catch (e) {
      lastErr = e;
      const status = e.status;
      const isRetryable =
        (status && RETRYABLE.has(status)) ||
        e.name === 'AbortError' ||
        e.name === 'TypeError'; // 网络层错误（连接中断等）
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
