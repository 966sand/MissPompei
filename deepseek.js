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

export async function callDeepSeek(userPrompt) {
  if (!DEEPSEEK_API_KEY) {
    throw new Error('服务端未配置 DEEPSEEK_API_KEY');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  let resp;
  try {
    resp = await fetch(DEEPSEEK_API_URL, {
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
  } finally {
    clearTimeout(timer);
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`DeepSeek API ${resp.status}: ${text.slice(0, 200)}`);
  }

  const j = await resp.json();
  const content = j?.choices?.[0]?.message?.content || '';
  return parseModelJSON(content);
}
